import { NextResponse } from "next/server";
import {
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { sendSampleGbpReviewToSlack } from "@/lib/google-business/review-slack-notifier";
import { isSlackConfigured } from "@/lib/slack/config";

export async function POST() {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return forbiddenResponse();
    }

    if (!isSlackConfigured()) {
      return NextResponse.json(
        { error: "Set SLACK_BOT_TOKEN in Vercel before sending a test notification." },
        { status: 400 }
      );
    }

    await sendSampleGbpReviewToSlack(user.companyId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send test notification";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
