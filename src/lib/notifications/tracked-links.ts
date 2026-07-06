import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import type { TemplateContext } from "@/lib/notifications/templates";

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL ?? "";

export type TrackedLinkKind =
  | "portal"
  | "invoice"
  | "review"
  | "survey"
  | "technician"
  | "estimate";

export const TRACKED_LINK_CONTEXT_KEYS: Record<TrackedLinkKind, string> = {
  portal: "portal_link",
  invoice: "invoice_link",
  review: "review_link",
  survey: "survey_link",
  technician: "about_technician_link",
  estimate: "estimate_link",
};

export function templateContextWithTrackedPlaceholders(
  context: TemplateContext,
  linkPlaceholders: Partial<Record<TrackedLinkKind, string>>
): TemplateContext {
  const next = { ...context };
  for (const kind of Object.keys(linkPlaceholders) as TrackedLinkKind[]) {
    const contextKey = TRACKED_LINK_CONTEXT_KEYS[kind];
    if (contextKey && linkPlaceholders[kind]) {
      next[contextKey] = `{${contextKey}}`;
    }
  }
  return next;
}

export async function buildTrackedUrlMap(
  deliveryId: string,
  linkPlaceholders: Partial<Record<TrackedLinkKind, string>>
): Promise<Record<string, string>> {
  const urlMap: Record<string, string> = {};

  for (const [kind, dest] of Object.entries(linkPlaceholders)) {
    if (!dest || typeof dest !== "string") continue;
    const tracked = await createTrackedLink({
      deliveryId,
      kind: kind as TrackedLinkKind,
      destinationUrl: dest,
    });
    const contextKey = TRACKED_LINK_CONTEXT_KEYS[kind as TrackedLinkKind];
    if (contextKey) {
      urlMap[`{${contextKey}}`] = tracked;
    }
  }

  return urlMap;
}

export async function createTrackedLink(params: {
  deliveryId: string;
  kind: TrackedLinkKind;
  destinationUrl: string;
}): Promise<string> {
  const token = randomBytes(12).toString("base64url");
  await prisma.trackedLink.create({
    data: {
      deliveryId: params.deliveryId,
      kind: params.kind,
      destinationUrl: params.destinationUrl,
      token,
    },
  });
  return `${APP_URL()}/api/track/l/${token}`;
}

export async function recordTrackedLinkClick(token: string): Promise<string | null> {
  const link = await prisma.trackedLink.findUnique({ where: { token } });
  if (!link) return null;

  await prisma.trackedLink.update({
    where: { id: link.id },
    data: {
      clickCount: { increment: 1 },
      clickedAt: link.clickedAt ?? new Date(),
    },
  });

  return link.destinationUrl;
}

export type ReviewLinkClickRow = {
  id: string;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  visitId: string | null;
  visitTitle: string | null;
  visitDate: string | null;
  sentAt: string;
  clickedAt: string | null;
  clickCount: number;
};

export async function getReviewLinkClickStats(companyId: string) {
  const links = await prisma.trackedLink.findMany({
    where: {
      kind: "review",
      delivery: {
        companyId,
        event: "REVIEW_REQUEST",
      },
    },
    include: {
      delivery: {
        include: {
          customer: { select: { id: true, name: true, phone: true } },
        },
      },
    },
    orderBy: [{ clickedAt: "desc" }, { createdAt: "desc" }],
    take: 100,
  });

  const visitIds = [
    ...new Set(
      links.map((link) => link.delivery.visitId).filter((id): id is string => Boolean(id))
    ),
  ];
  const visits =
    visitIds.length > 0
      ? await prisma.visit.findMany({
          where: { id: { in: visitIds }, companyId },
          select: { id: true, title: true, startAt: true },
        })
      : [];
  const visitById = new Map(visits.map((visit) => [visit.id, visit]));

  const sent = links.length;
  const clicked = links.filter((link) => link.clickCount > 0).length;
  const totalClicks = links.reduce((sum, link) => sum + link.clickCount, 0);

  const rows: ReviewLinkClickRow[] = links
    .filter((link) => link.clickCount > 0)
    .map((link) => {
      const visit = link.delivery.visitId ? visitById.get(link.delivery.visitId) : undefined;
      return {
        id: link.id,
        customerId: link.delivery.customerId,
        customerName: link.delivery.customer?.name ?? null,
        customerPhone: link.delivery.customer?.phone ?? null,
        visitId: link.delivery.visitId,
        visitTitle: visit?.title ?? null,
        visitDate: visit?.startAt?.toISOString() ?? null,
        sentAt: link.delivery.createdAt.toISOString(),
        clickedAt: link.clickedAt?.toISOString() ?? null,
        clickCount: link.clickCount,
      };
    });

  return { sent, clicked, totalClicks, rows };
}

export function injectTrackedUrlsInText(
  body: string,
  urlMap: Record<string, string>
): string {
  let result = body;
  for (const [placeholder, trackedUrl] of Object.entries(urlMap)) {
    result = result.split(placeholder).join(trackedUrl);
  }
  return result;
}
