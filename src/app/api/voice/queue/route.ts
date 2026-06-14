import { NextResponse } from "next/server";
import { CallSessionStatus } from "@prisma/client";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const waiting = await prisma.callSession.findMany({
      where: {
        companyId: user.companyId,
        queueEnteredAt: { not: null },
        status: CallSessionStatus.RINGING,
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { queueEnteredAt: "asc" },
    });

    return NextResponse.json({ queue: waiting });
  } catch {
    return unauthorizedResponse();
  }
}
