import { NextResponse } from "next/server";
import { CallSessionStatus } from "@prisma/client";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { lookupCustomerByPhone } from "@/lib/voice/caller-lookup";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const waiting = await prisma.callSession.findMany({
      where: {
        companyId: user.companyId,
        queueEnteredAt: { not: null },
        status: CallSessionStatus.RINGING,
      },
      orderBy: { queueEnteredAt: "asc" },
    });

    const queue = await Promise.all(
      waiting.map(async (entry) => {
        const lookup = await lookupCustomerByPhone(user.companyId, entry.fromNumber);
        return {
          id: entry.id,
          fromNumber: entry.fromNumber,
          queueEnteredAt: entry.queueEnteredAt?.toISOString() ?? null,
          customer: lookup.customerId
            ? {
                id: lookup.customerId,
                name: lookup.name,
                phone: lookup.phone,
                city: lookup.city,
                mostRecentVisitAt: lookup.mostRecentVisitAt,
              }
            : null,
        };
      })
    );

    return NextResponse.json({ queue });
  } catch {
    return unauthorizedResponse();
  }
}
