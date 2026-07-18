import { NextResponse } from "next/server";
import { CallSessionStatus } from "@prisma/client";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

/** Missed / unanswered softphone transfers targeting this user. */
export async function GET(request: Request) {
  try {
    const user = await requireSessionUser(request);
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    const sessions = await prisma.callSession.findMany({
      where: {
        companyId: user.companyId,
        transferTargetUserId: user.id,
        createdAt: { gte: since },
        OR: [
          { status: CallSessionStatus.COMPLETED, assignedUserId: { not: user.id } },
          {
            status: { in: [CallSessionStatus.RINGING, CallSessionStatus.TRANSFERRING] },
            endedAt: { not: null },
          },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        status: true,
        fromNumber: true,
        toNumber: true,
        createdAt: true,
        endedAt: true,
        transferType: true,
        customerId: true,
        customer: { select: { id: true, name: true, phone: true } },
        visits: { select: { id: true }, take: 1 },
      },
    });

    return NextResponse.json({
      transfers: sessions.map((s) => ({
        id: s.id,
        status: s.status,
        fromNumber: s.fromNumber,
        toNumber: s.toNumber,
        startedAt: s.createdAt.toISOString(),
        endedAt: s.endedAt?.toISOString() ?? null,
        transferType: s.transferType,
        customerId: s.customerId,
        customer: s.customer,
        visitId: s.visits[0]?.id ?? null,
      })),
    });
  } catch {
    return unauthorizedResponse();
  }
}
