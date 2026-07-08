import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getTwilioVoiceToken } from "@/lib/inbox/twilio";
import { voiceClientIdentity } from "@/lib/voice/identity";

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser(request);
    const identity = voiceClientIdentity(user.companyId, user.id);
    const platformParam = request.nextUrl.searchParams.get("platform");
    const platform =
      platformParam === "ios" || platformParam === "android" ? platformParam : "web";
    const token = getTwilioVoiceToken(identity, { platform });
    return NextResponse.json({ token, identity });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate token";
    const missingCredentials =
      message.includes("not configured") || message.includes("credentials");
    return NextResponse.json(
      { error: message },
      { status: missingCredentials ? 503 : 500 }
    );
  }
}
