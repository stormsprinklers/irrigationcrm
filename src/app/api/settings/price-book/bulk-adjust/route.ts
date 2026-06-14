import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { bulkAdjustPrices } from "@/lib/price-book/pricing";

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { percent, scope, categoryId, adjustCost, dryRun } = body;

    if (percent == null || Number.isNaN(Number(percent))) {
      return NextResponse.json({ error: "percent required" }, { status: 400 });
    }

    const result = await bulkAdjustPrices({
      companyId: user.companyId,
      percent: Number(percent),
      scope: scope ?? "ALL",
      categoryId: categoryId || undefined,
      adjustCost: Boolean(adjustCost),
      dryRun: Boolean(dryRun),
    });

    return NextResponse.json(result);
  } catch {
    return unauthorizedResponse();
  }
}
