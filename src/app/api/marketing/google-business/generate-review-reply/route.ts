import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { generateGbpReviewReplyDraft } from "@/lib/google-business/gbp-ai";
import { GBP_STAR_LABELS } from "@/lib/google-business/engagement-types";
import { GoogleBusinessApiError, requireGbpCompany } from "@/lib/google-business/client";
import { getOpenAIApiKey } from "@/lib/openai/client";

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!getOpenAIApiKey()) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not configured on the server" },
        { status: 503 }
      );
    }

    const company = await requireGbpCompany(user.companyId);
    const body = await request.json();

    const reviewerName = String(body.reviewerName ?? "Customer").trim() || "Customer";
    const starRatingKey = String(body.starRating ?? "FIVE");
    const starRating = GBP_STAR_LABELS[starRatingKey] ?? Number(body.starRatingNumber) ?? 5;
    const reviewComment = body.reviewComment ? String(body.reviewComment) : null;

    const draft = await generateGbpReviewReplyDraft({
      companyName: company.name,
      locationTitle: company.googleBusinessLocationTitle,
      reviewerName,
      starRating,
      reviewComment,
    });

    return NextResponse.json(draft);
  } catch (error) {
    if (error instanceof GoogleBusinessApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message = error instanceof Error ? error.message : "Failed to generate reply draft";
    const status = message.includes("OPENAI") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
