import { randomBytes } from "crypto";
import { VisitStatus } from "@prisma/client";
import {
  buildMapsDirectionsEmbedUrl,
  buildMapsPlaceEmbedUrl,
  buildMapsPinEmbedUrl,
  getGoogleMapsApiKey,
} from "@/lib/customers/maps";
import {
  computeDrivingEta,
  formatVisitEtaPayload,
  resolveVisitDestination,
} from "@/lib/maps/eta";
import { resolvePortalSlug } from "@/lib/portal/company";
import { prisma } from "@/lib/prisma";
import { publicTechnicianPhotoUrl } from "@/lib/notifications/technician-photo";
import { formatTimeInTimezone } from "@/lib/notifications/timezone";

const MIN_PING_INTERVAL_MS = 8_000;
const ETA_REFRESH_INTERVAL_MS = 60_000;
export const LIVE_TRACK_TTL_MS = 2 * 60 * 60 * 1000;

export function generateLiveTrackToken() {
  return randomBytes(18).toString("base64url");
}

export function buildLiveTrackUrl(params: {
  portalSlug: string | null;
  bookingSlug: string | null;
  token: string;
}) {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const slug = resolvePortalSlug({
    portalSlug: params.portalSlug,
    bookingSlug: params.bookingSlug,
  });
  if (!appUrl || !slug || !params.token) return null;
  return `${appUrl}/portal/${slug}/track/${params.token}`;
}

/** Ensure a visit has a public track token; activate live tracking. */
export async function activateLiveTracking(params: {
  visitId: string;
  lat?: number | null;
  lng?: number | null;
}) {
  const existing = await prisma.visit.findUnique({
    where: { id: params.visitId },
    select: { liveTrackToken: true },
  });
  const token = existing?.liveTrackToken ?? generateLiveTrackToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LIVE_TRACK_TTL_MS);
  return prisma.visit.update({
    where: { id: params.visitId },
    data: {
      liveTrackToken: token,
      liveTrackingActive: true,
      liveTrackExpiresAt: expiresAt,
      ...(params.lat != null && params.lng != null
        ? {
            liveLat: params.lat,
            liveLng: params.lng,
            liveLocationAt: now,
            enRouteOriginLat: params.lat,
            enRouteOriginLng: params.lng,
          }
        : {}),
    },
    select: {
      id: true,
      liveTrackToken: true,
      company: { select: { portalSlug: true, bookingSlug: true } },
    },
  });
}

export async function stopLiveTracking(visitId: string) {
  await prisma.visit.update({
    where: { id: visitId },
    data: { liveTrackingActive: false },
  });
}

export async function recordLiveLocationPing(params: {
  companyId: string;
  visitId: string;
  lat: number;
  lng: number;
  heading?: number | null;
  speedMps?: number | null;
}) {
  const visit = await prisma.visit.findFirst({
    where: { id: params.visitId, companyId: params.companyId },
    include: {
      customer: {
        select: { address: true, city: true, state: true, zip: true },
      },
      property: { select: { address: true, city: true, state: true, zip: true } },
    },
  });
  if (!visit) return { ok: false as const, error: "Not found", status: 404 };
  if (visit.status !== VisitStatus.EN_ROUTE) {
    return { ok: false as const, error: "Visit is not en route", status: 409 };
  }
  if (!visit.liveTrackingActive) {
    return { ok: false as const, error: "Live tracking is not active", status: 409 };
  }

  const now = new Date();
  if (
    visit.liveLocationAt &&
    now.getTime() - visit.liveLocationAt.getTime() < MIN_PING_INTERVAL_MS
  ) {
    return {
      ok: true as const,
      skipped: true as const,
      liveLocationAt: visit.liveLocationAt.toISOString(),
    };
  }

  const update: {
    liveLat: number;
    liveLng: number;
    liveLocationAt: Date;
    enRouteOriginLat: number;
    enRouteOriginLng: number;
    enRouteEtaSeconds?: number;
    enRouteEtaAt?: Date;
    enRouteCalculatedAt?: Date;
  } = {
    liveLat: params.lat,
    liveLng: params.lng,
    liveLocationAt: now,
    enRouteOriginLat: params.lat,
    enRouteOriginLng: params.lng,
  };

  const shouldRefreshEta =
    !visit.enRouteCalculatedAt ||
    now.getTime() - visit.enRouteCalculatedAt.getTime() >= ETA_REFRESH_INTERVAL_MS;

  if (shouldRefreshEta) {
    const destination = resolveVisitDestination(visit);
    if (destination) {
      try {
        const eta = await computeDrivingEta({
          originLat: params.lat,
          originLng: params.lng,
          destinationAddress: destination,
        });
        update.enRouteEtaSeconds = eta.durationInTrafficSeconds;
        update.enRouteEtaAt = eta.arrivalAt;
        update.enRouteCalculatedAt = now;
      } catch (err) {
        console.error("[live-tracking] ETA refresh failed", err);
      }
    }
  }

  const updated = await prisma.visit.update({
    where: { id: visit.id },
    data: update,
    select: {
      liveLocationAt: true,
      enRouteEtaSeconds: true,
      enRouteEtaAt: true,
      enRouteCalculatedAt: true,
    },
  });

  return {
    ok: true as const,
    skipped: false as const,
    liveLocationAt: updated.liveLocationAt?.toISOString() ?? now.toISOString(),
    eta: formatVisitEtaPayload(updated),
  };
}

function etaNeedsRefresh(calculatedAt: Date | null, nowMs: number) {
  return !calculatedAt || nowMs - calculatedAt.getTime() >= ETA_REFRESH_INTERVAL_MS;
}

async function refreshEnRouteEtaIfStale(params: {
  visitId: string;
  originLat: number;
  originLng: number;
  destination: string;
  calculatedAt: Date | null;
  force?: boolean;
}) {
  const now = Date.now();
  if (!params.force && !etaNeedsRefresh(params.calculatedAt, now)) {
    return null;
  }
  try {
    const eta = await computeDrivingEta({
      originLat: params.originLat,
      originLng: params.originLng,
      destinationAddress: params.destination,
    });
    const calculatedAt = new Date();
    await prisma.visit.update({
      where: { id: params.visitId },
      data: {
        enRouteEtaSeconds: eta.durationInTrafficSeconds,
        enRouteEtaAt: eta.arrivalAt,
        enRouteCalculatedAt: calculatedAt,
      },
    });
    return {
      enRouteEtaSeconds: eta.durationInTrafficSeconds,
      enRouteEtaAt: eta.arrivalAt,
      enRouteCalculatedAt: calculatedAt,
    };
  } catch (err) {
    console.error("[live-tracking] public ETA refresh failed", err);
    return null;
  }
}

export async function getPublicLiveTrack(token: string, options?: { forceRefresh?: boolean }) {
  const visit = await prisma.visit.findFirst({
    where: { liveTrackToken: token },
    include: {
      company: {
        select: {
          id: true,
          name: true,
          phone: true,
          emailLogoUrl: true,
          timezone: true,
          portalSlug: true,
          bookingSlug: true,
          portalEnabled: true,
        },
      },
      assignedUser: { select: { id: true, name: true, photoUrl: true } },
      customer: {
        select: { name: true, address: true, city: true, state: true, zip: true },
      },
      property: { select: { address: true, city: true, state: true, zip: true } },
    },
  });

  if (!visit || !visit.company.portalEnabled) return null;

  const slug = resolvePortalSlug(visit.company);
  if (!slug) return null;

  const expired =
    Boolean(visit.liveTrackExpiresAt) &&
    visit.liveTrackExpiresAt!.getTime() < Date.now();
  if (expired) {
    return {
      expired: true as const,
      company: {
        name: visit.company.name,
        phone: visit.company.phone,
        emailLogoUrl: visit.company.emailLogoUrl,
        slug,
      },
    };
  }

  const destination = resolveVisitDestination(visit);
  const techLat = visit.liveLat != null ? Number(visit.liveLat) : null;
  const techLng = visit.liveLng != null ? Number(visit.liveLng) : null;
  const hasLive = techLat != null && techLng != null;
  const active =
    visit.liveTrackingActive &&
    visit.status === VisitStatus.EN_ROUTE &&
    Boolean(visit.liveTrackToken) &&
    !expired;

  let etaSeconds = visit.enRouteEtaSeconds;
  let etaAt = visit.enRouteEtaAt;
  let etaCalculatedAt = visit.enRouteCalculatedAt;

  if (active && hasLive && destination) {
    const refreshed = await refreshEnRouteEtaIfStale({
      visitId: visit.id,
      originLat: techLat,
      originLng: techLng,
      destination,
      calculatedAt: visit.enRouteCalculatedAt,
      force: options?.forceRefresh,
    });
    if (refreshed) {
      etaSeconds = refreshed.enRouteEtaSeconds;
      etaAt = refreshed.enRouteEtaAt;
      etaCalculatedAt = refreshed.enRouteCalculatedAt;
    }
  }

  const apiKey = getGoogleMapsApiKey();
  let mapEmbedUrl: string | null = null;
  if (apiKey && hasLive && destination) {
    mapEmbedUrl = buildMapsDirectionsEmbedUrl({
      originLat: techLat,
      originLng: techLng,
      destination,
      apiKey,
    });
  } else if (apiKey && hasLive) {
    mapEmbedUrl = buildMapsPinEmbedUrl(techLat, techLng, apiKey, 14);
  } else if (apiKey && destination) {
    mapEmbedUrl = buildMapsPlaceEmbedUrl(destination, apiKey, 13);
  }

  const eta = formatVisitEtaPayload({
    enRouteEtaSeconds: etaSeconds,
    enRouteEtaAt: etaAt,
    enRouteCalculatedAt: etaCalculatedAt,
  });
  const timezone = visit.company.timezone;
  const etaLabel =
    eta && etaAt
      ? `${formatTimeInTimezone(etaAt, timezone)} (about ${eta.minutes} min)`
      : null;

  const stale =
    !visit.liveLocationAt ||
    Date.now() - visit.liveLocationAt.getTime() > 5 * 60_000;

  return {
    expired: false as const,
    company: {
      name: visit.company.name,
      phone: visit.company.phone,
      emailLogoUrl: visit.company.emailLogoUrl,
      slug,
    },
    visit: {
      title: visit.title,
      status: visit.status,
      destination,
    },
    technician: {
      name: visit.assignedUser?.name ?? "Your technician",
      photoUrl: visit.assignedUser
        ? publicTechnicianPhotoUrl({
            userId: visit.assignedUser.id,
            photoUrl: visit.assignedUser.photoUrl,
          })
        : null,
      firstName: (visit.assignedUser?.name ?? "Your technician").split(/\s+/)[0],
    },
    tracking: {
      active,
      stale: active && stale,
      lat: hasLive ? techLat : null,
      lng: hasLive ? techLng : null,
      updatedAt: visit.liveLocationAt?.toISOString() ?? null,
      etaLabel,
      etaMinutes: eta?.minutes ?? null,
      etaArrivalAt: eta?.arrivalAt ?? null,
      mapEmbedUrl,
    },
  };
}
