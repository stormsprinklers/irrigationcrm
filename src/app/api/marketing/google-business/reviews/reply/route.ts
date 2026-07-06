import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { canManageCustomers } from "@/lib/customers/permissions";
import { GoogleBusinessApiError, requireGbpCompany } from "@/lib/google-business/client";
import { updateGbpReviewReply } from "@/lib/google-business/v4-api";

export async function PUT(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canManageCustomers(user.role)) return forbiddenResponse();

    await requireGbpCompany(user.companyId);
    const body = await request.json();
    const reviewName = String(body.reviewName ?? "").trim();
    const comment = String(body.comment ?? "").trim();
    if (!reviewName) return badRequestResponse("reviewName is required");
    if (!comment) return badRequestResponse("Reply comment is required");

    const data = await updateGbpReviewReply(user.companyId, reviewName, comment);
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof GoogleBusinessApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message = error instanceof Error ? error.message : "Failed to post review reply";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
