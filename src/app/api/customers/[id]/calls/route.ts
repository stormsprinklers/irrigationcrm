import { NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { listCustomerCallHistory } from "@/lib/voice/call-history-queries";

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

    const calls = await listCustomerCallHistory(user.companyId, customerId);
    return NextResponse.json({ calls });
  } catch {
    return unauthorizedResponse();
  }
}
