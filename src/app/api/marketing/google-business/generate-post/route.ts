import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { generateGbpPostDraft } from "@/lib/google-business/gbp-ai";
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
    const brief = String(body.brief ?? "").trim();
    if (!brief) return badRequestResponse("Describe what you want the post to cover");

    const draft = await generateGbpPostDraft({
      companyName: company.name,
      locationTitle: company.googleBusinessLocationTitle,
      userBrief: brief,
    });

    return NextResponse.json(draft);
  } catch (error) {
    if (error instanceof GoogleBusinessApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message = error instanceof Error ? error.message : "Failed to generate post draft";
    const status = message.includes("OPENAI") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
