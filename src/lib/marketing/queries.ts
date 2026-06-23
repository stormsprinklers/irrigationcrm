import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
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
