import { NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getTwilioVoiceToken } from "@/lib/inbox/twilio";

export async function POST() {
  try {
    const user = await requireSessionUser();
    const token = getTwilioVoiceToken(user.id);
    return NextResponse.json({ token });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate token" },
      { status: 500 }
    );
  }
}
