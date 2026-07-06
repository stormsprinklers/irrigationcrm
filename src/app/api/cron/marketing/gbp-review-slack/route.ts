import { NextRequest, NextResponse } from "next/server";
import { processGbpReviewSlackNotifications } from "@/lib/google-business/review-slack-notifier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processGbpReviewSlackNotifications();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "GBP Slack cron failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
