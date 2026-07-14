import { AttributionFirstTouchMethod, type Prisma } from "@prisma/client";
import {
  parseAttributionFromMetadata,
  recordTouchEvent,
  resolvePersonByPhone,
} from "@/lib/attribution";
import { prisma } from "@/lib/prisma";
import type { WebsiteEventInput } from "@/lib/integrations/schemas";

export async function recordMarketingEvent(companyId: string, input: WebsiteEventInput) {
  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();

  const existing = await prisma.marketingEvent.findFirst({
    where: {
      companyId,
      source: "WEBSITE",
      externalId: input.externalId,
    },
  });

  if (existing) {
    return { event: existing, created: false };
  }

  const event = await prisma.marketingEvent.create({
    data: {
      companyId,
      source: "WEBSITE",
      eventType: input.eventType,
      externalId: input.externalId,
      sessionId: input.sessionId ?? null,
      pagePath: input.pagePath ?? null,
      metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      occurredAt,
    },
  });

  const clickTypes = new Set(["TEL_CLICK", "SMS_CLICK"]);
  if (clickTypes.has(input.eventType)) {
    const meta =
      input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
        ? (input.metadata as Record<string, unknown>)
        : {};
    const phone =
      typeof meta.phone === "string"
        ? meta.phone
        : typeof meta.cta_destination === "string" && meta.cta_destination.startsWith("tel:")
          ? meta.cta_destination.slice(4)
          : null;
    const person = phone ? await resolvePersonByPhone(companyId, phone) : { customerId: null, leadId: null };
    const method =
      input.eventType === "TEL_CLICK"
        ? AttributionFirstTouchMethod.TEL_CLICK
        : AttributionFirstTouchMethod.SMS_CLICK;

    await recordTouchEvent({
      companyId,
      customerId: person.customerId,
      leadId: person.leadId,
      sessionId: input.sessionId,
      eventType: input.eventType,
      method,
      attribution: parseAttributionFromMetadata(meta),
      phone,
      pagePath: input.pagePath,
      occurredAt,
      metadata: meta,
      // Clicks alone rarely identify a person; stamp when we can resolve one.
      stampFirstTouch: Boolean(person.customerId || person.leadId),
    }).catch(() => {});
  }

  return { event, created: true };
}

export async function getMarketingReport(
  companyId: string,
  params: { from: Date; to: Date }
) {
  const events = await prisma.marketingEvent.findMany({
    where: {
      companyId,
      occurredAt: { gte: params.from, lte: params.to },
    },
    select: { eventType: true, pagePath: true, occurredAt: true },
  });

  const byType = new Map<string, number>();
  const byPage = new Map<string, number>();

  for (const e of events) {
    byType.set(e.eventType, (byType.get(e.eventType) ?? 0) + 1);
    if (e.pagePath) {
      byPage.set(e.pagePath, (byPage.get(e.pagePath) ?? 0) + 1);
    }
  }

  const topPages = [...byPage.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([pagePath, count]) => ({ pagePath, count }));

  return {
    total: events.length,
    byType: [...byType.entries()].map(([eventType, count]) => ({ eventType, count })),
    topPages,
  };
}
