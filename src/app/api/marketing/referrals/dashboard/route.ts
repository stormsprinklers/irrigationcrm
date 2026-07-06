import { NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canManageCustomers } from "@/lib/customers/permissions";
import {
  computeReferralMetrics,
  listReferralPipeline,
  listReferralRewardsQueue,
} from "@/lib/referrals/dashboard";
import { parseReportRangeFromSearchParams, resolveReportRange } from "@/lib/reporting/date-range";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canManageCustomers(user.role)) return forbiddenResponse();

    const rangeInput = parseReportRangeFromSearchParams(request.nextUrl.searchParams);
    const range = resolveReportRange(rangeInput);

    const [metrics, pipeline, rewardsQueue] = await Promise.all([
      computeReferralMetrics({
        companyId: user.companyId,
        start: range.start,
        end: range.end,
      }),
      listReferralPipeline({
        companyId: user.companyId,
        start: range.start,
        end: range.end,
      }),
      listReferralRewardsQueue(user.companyId),
    ]);

    return NextResponse.json({
      range: {
        preset: range.preset,
        label: range.label,
        start: range.start.toISOString(),
        end: range.end.toISOString(),
      },
      metrics,
      pipeline,
      rewardsQueue,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message = error instanceof Error ? error.message : "Failed to load referrals dashboard";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
