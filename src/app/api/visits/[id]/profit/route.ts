import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { computeVisitProfit } from "@/lib/visits/profit";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const profit = await computeVisitProfit(user.companyId, id);
    if (!profit) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(profit);
  } catch {
    return unauthorizedResponse();
  }
}
