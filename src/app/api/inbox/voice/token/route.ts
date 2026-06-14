import { NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getTwilioVoiceToken } from "@/lib/inbox/twilio";
import { voiceClientIdentity } from "@/lib/voice/identity";

export async function POST() {
  try {
    const user = await requireSessionUser();
    const identity = voiceClientIdentity(user.companyId, user.id);
    const token = getTwilioVoiceToken(identity);
    return NextResponse.json({ token, identity });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate token" },
      { status: 500 }
    );
  }
}
