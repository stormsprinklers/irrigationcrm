import { NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canViewProfitMargins } from "@/lib/employees";
import { computeVisitProfit } from "@/lib/visits/profit";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canViewProfitMargins(user.role)) return forbiddenResponse();

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
