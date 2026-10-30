import { NextRequest, NextResponse } from "next/server";
import {
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { querySalesPipeline } from "@/lib/customers/pipeline-report";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser(request);
    if (user.role !== "AFFILIATE") return forbiddenResponse();
    const page = Math.max(1, Math.floor(Number(request.nextUrl.searchParams.get("page")) || 1));
    const pageSize = 100;
    const result = await querySalesPipeline(
      user.companyId,
      {},
      { skip: (page - 1) * pageSize, take: pageSize },
      { affiliateUserId: user.id }
    );
    return NextResponse.json({ ...result, page, pageSize });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return unauthorizedResponse();
    console.error("Affiliate pipeline failed", error);
    return NextResponse.json({ error: "Could not load affiliate pipeline" }, { status: 500 });
  }
}
