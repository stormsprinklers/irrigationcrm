import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/api-auth";
import { requireRealAdmin } from "@/lib/owner-assistant/access";
import { verifyOwnerAssistantStepUpToken } from "@/lib/owner-assistant/step-up";
import { searchAvailableNumbers } from "@/lib/twilio/numbers";
import { normalizeContainsPattern } from "@/lib/twilio/vanity";

export async function GET(request: NextRequest) {
  try {
    const session = await requireSessionUser(request);
    const owner = await requireRealAdmin(session);
    const verified = await verifyOwnerAssistantStepUpToken(request.headers.get("x-owner-assistant-mfa") || "", { userId: owner.id, companyId: owner.companyId });
    if (!verified.ok) return NextResponse.json({ error: verified.error }, { status: 401 });
    const numbers = await searchAvailableNumbers(request.nextUrl.searchParams.get("areaCodes") ?? "", normalizeContainsPattern(request.nextUrl.searchParams.get("contains") ?? ""));
    return NextResponse.json({ numbers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Search failed" }, { status: 500 });
  }
}
