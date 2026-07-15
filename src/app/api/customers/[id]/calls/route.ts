import { NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { listCustomerCallHistory } from "@/lib/voice/call-history-queries";
import { backfillCallLogCustomers } from "@/lib/voice/backfill-call-customers";
import { backfillCallLogEmployees } from "@/lib/voice/backfill-call-employees";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id: customerId } = await params;

    const customer = await prisma.customer.findFirst({
      where: { id: customerId, companyId: user.companyId },
      select: { id: true },
    });
    if (!customer) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Heal older call logs missing customer links before listing.
    await backfillCallLogCustomers({ companyId: user.companyId, take: 500 }).catch(() => {});
    await backfillCallLogEmployees({ companyId: user.companyId, take: 500 }).catch(() => {});

    const calls = await listCustomerCallHistory(user.companyId, customerId);
    return NextResponse.json({ calls });
  } catch {
    return unauthorizedResponse();
  }
}
