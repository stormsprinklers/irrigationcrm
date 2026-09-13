import { NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const now = new Date();
    const events = await prisma.marketingEvent.findMany({
      where: { companyId: user.companyId, source: "WEBSITE", sessionId: { not: null },
        eventType: "VISITOR_HEARTBEAT", occurredAt: { gte: new Date(now.getTime() - 120000), lte: now } },
      select: { sessionId: true, pagePath: true, occurredAt: true },
      orderBy: { occurredAt: "desc" },
    });
    const visitors = new Set<string>();
    const pages = new Map<string, number>();
    for (const event of events) {
      if (!event.sessionId || visitors.has(event.sessionId)) continue;
      visitors.add(event.sessionId);
      const page = event.pagePath || "/";
      pages.set(page, (pages.get(page) ?? 0) + 1);
    }
    return NextResponse.json({ visitors: visitors.size, pages: [...pages].map(([label, count]) => ({ label, count })).sort((a,b) => b.count-a.count), updatedAt: now.toISOString(), windowSeconds: 120 }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return unauthorizedResponse();
    return NextResponse.json({ error: "Live visitors unavailable" }, { status: 500 });
  }
}
