import { NextRequest, NextResponse } from "next/server";
import { notifyAllCompaniesOfNewGbpReviews } from "@/lib/google-business/review-staff-notifier";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await notifyAllCompaniesOfNewGbpReviews();
  const notified = results.reduce((sum, row) => sum + (row.notified ?? 0), 0);

  return NextResponse.json({ ok: true, notified, results });
}
