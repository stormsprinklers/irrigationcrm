import { NextRequest, NextResponse } from "next/server";
import { TimeEventType, VisitStatus } from "@prisma/client";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { assertVisitCanComplete } from "@/lib/checklists/apply";
import {
  computeDrivingEta,
  formatVisitEtaPayload,
  MapsEtaError,
  resolveVisitDestination,
} from "@/lib/maps/eta";
import { buildEnRouteContext } from "@/lib/notifications/context";
import { ensureDefaultNotificationTemplates, sendOperationalNotification } from "@/lib/notifications/send";
import { onVisitCompleted } from "@/lib/notifications/visit-events";
import { completeMaintenancePlanVisit } from "@/lib/maintenance-plans/discounts";
import { prisma } from "@/lib/prisma";
import { getVisitForCompany } from "@/lib/visits/queries";

type Params = { params: Promise<{ id: string }> };

const STATUS_MAP: Partial<Record<TimeEventType, VisitStatus>> = {
  EN_ROUTE: VisitStatus.EN_ROUTE,
  START: VisitStatus.IN_PROGRESS,
  PAUSE: VisitStatus.PAUSED,
  RESUME: VisitStatus.IN_PROGRESS,
  FINISH: VisitStatus.COMPLETED,
};

const CLEAR_ETA_TYPES = new Set<TimeEventType>([
  TimeEventType.START,
  TimeEventType.RESUME,
  TimeEventType.FINISH,
]);

function parseOrigin(body: Record<string, unknown>) {
  const lat = Number(body.originLat);
  const lng = Number(body.originLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function serializeVisitResponse(
  visit: NonNullable<Awaited<ReturnType<typeof getVisitForCompany>>>,
  extras?: { etaWarning?: string }
) {
  return {
    ...visit,
    startAt: visit.startAt.toISOString(),
    endAt: visit.endAt.toISOString(),
    enRouteEtaAt: visit.enRouteEtaAt?.toISOString() ?? null,
    enRouteCalculatedAt: visit.enRouteCalculatedAt?.toISOString() ?? null,
    enRouteOriginLat: visit.enRouteOriginLat ? Number(visit.enRouteOriginLat) : null,
    enRouteOriginLng: visit.enRouteOriginLng ? Number(visit.enRouteOriginLng) : null,
    eta: formatVisitEtaPayload(visit),
    ...(extras?.etaWarning ? { etaWarning: extras.etaWarning } : {}),
  };
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const visit = await prisma.visit.findFirst({
      where: { id, companyId: user.companyId },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            address: true,
            city: true,
            state: true,
            zip: true,
          },
        },
        property: { select: { address: true, city: true, state: true, zip: true } },
        assignedUser: { select: { id: true, name: true } },
        company: { select: { name: true, timezone: true } },
      },
    });
    if (!visit) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = (await request.json()) as Record<string, unknown>;
    const type = body.type as TimeEventType;
    if (!Object.values(TimeEventType).includes(type)) {
      return badRequestResponse("Invalid time event type");
    }

    let etaWarning: string | undefined;
    const visitUpdate: {
      status?: VisitStatus;
      enRouteEtaSeconds?: number | null;
      enRouteEtaAt?: Date | null;
      enRouteCalculatedAt?: Date | null;
      enRouteOriginLat?: number | null;
      enRouteOriginLng?: number | null;
    } = {};

    const newStatus = STATUS_MAP[type];
    if (newStatus) {
      if (newStatus === VisitStatus.COMPLETED) {
        const checklistError = await assertVisitCanComplete(id, user.companyId);
        if (checklistError) return badRequestResponse(checklistError);
      }
      visitUpdate.status = newStatus;
    }

    if (CLEAR_ETA_TYPES.has(type)) {
      visitUpdate.enRouteEtaSeconds = null;
      visitUpdate.enRouteEtaAt = null;
      visitUpdate.enRouteCalculatedAt = null;
      visitUpdate.enRouteOriginLat = null;
      visitUpdate.enRouteOriginLng = null;
    }

    if (type === TimeEventType.EN_ROUTE) {
      const origin = parseOrigin(body);
      const destination = resolveVisitDestination(visit);

      if (!origin) {
        etaWarning = "Location unavailable — ETA not calculated.";
      } else if (!destination) {
        etaWarning = "Visit has no address — ETA not calculated.";
      } else {
        try {
          const eta = await computeDrivingEta({
            originLat: origin.lat,
            originLng: origin.lng,
            destinationAddress: destination,
          });
          visitUpdate.enRouteEtaSeconds = eta.durationInTrafficSeconds;
          visitUpdate.enRouteEtaAt = eta.arrivalAt;
          visitUpdate.enRouteCalculatedAt = new Date();
          visitUpdate.enRouteOriginLat = origin.lat;
          visitUpdate.enRouteOriginLng = origin.lng;
        } catch (err) {
          const message = err instanceof MapsEtaError ? err.message : "Failed to calculate ETA";
          etaWarning = message;
          console.error("Visit ETA error:", err);
        }
      }
    }

    await prisma.visitTimeEvent.create({
      data: { visitId: id, userId: user.id, type },
    });

    await prisma.visit.update({
      where: { id },
      data: visitUpdate,
    });

    if (visitUpdate.status === VisitStatus.COMPLETED) {
      await completeMaintenancePlanVisit(id);
      void onVisitCompleted(id, user.companyId).catch((err) =>
        console.error("Visit completed notification error:", err)
      );
    }

    const updated = await getVisitForCompany(user.companyId, id);
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (type === TimeEventType.EN_ROUTE && updated.customer?.phone) {
      await ensureDefaultNotificationTemplates(user.companyId);
      const technicianName = updated.assignedUser?.name ?? user.name;
      const destination = resolveVisitDestination(updated);
      void sendOperationalNotification({
        companyId: user.companyId,
        event: "VISIT_EN_ROUTE",
        recipient: {
          customerId: updated.customer.id,
          name: updated.customer.name,
          phone: updated.customer.phone,
          email: updated.customer.email,
        },
        context: buildEnRouteContext({
          customerName: updated.customer.name,
          companyName: visit.company.name,
          technicianName,
          visitTitle: updated.title,
          etaSeconds: updated.enRouteEtaSeconds,
          etaAt: updated.enRouteEtaAt,
          visitAddress: destination,
          timezone: visit.company.timezone,
        }),
        options: { visitId: id },
      }).catch((err) => console.error("VISIT_EN_ROUTE notification error:", err));
    }

    return NextResponse.json(serializeVisitResponse(updated, { etaWarning }));
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Visit time tracking error:", error);
    return NextResponse.json({ error: "Failed to update time tracking" }, { status: 500 });
  }
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const events = await prisma.visitTimeEvent.findMany({
      where: { visit: { id, companyId: user.companyId } },
      orderBy: { occurredAt: "asc" },
      include: { user: { select: { id: true, name: true } } },
    });
    return NextResponse.json(events);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Visit time events error:", error);
    return NextResponse.json({ error: "Failed to load time events" }, { status: 500 });
  }
}
