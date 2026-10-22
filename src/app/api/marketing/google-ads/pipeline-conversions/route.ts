import { NextResponse } from "next/server";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canManageCustomers } from "@/lib/customers/permissions";
import {
  ensureGooglePipelineConversionActions,
  GoogleAdsApiError,
} from "@/lib/google-ads/client";

export async function PUT() {
  try {
    const user = await requireSessionUser();
    if (!canManageCustomers(user.role)) return forbiddenResponse();
    const pipelineActions = await ensureGooglePipelineConversionActions(user.companyId);
    return NextResponse.json({ ok: true, pipelineActions });
  } catch (error) {
    if (error instanceof GoogleAdsApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error && error.message === "Unauthorized") return unauthorizedResponse();
    return NextResponse.json({ error: "Could not configure pipeline conversion actions" }, { status: 500 });
  }
}
