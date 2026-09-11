import { NextRequest, NextResponse } from "next/server";
import { notifyAllCompaniesOfNewGbpReviews } from "@/lib/google-business/review-staff-notifier";
import { syncAndAssignGbpReviews } from "@/lib/google-business/review-assigner";
import { isGbpReviewPullHour } from "@/lib/google-business/review-pull-window";
import { prisma } from "@/lib/prisma";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Vercel cron is UTC; fire at 22:00 and 23:00 UTC and only pull at 4pm Mountain.
  if (!isGbpReviewPullHour()) {
    return NextResponse.json({ ok: true, skipped: "not_4pm_mountain" });
  }

  const companies = await prisma.company.findMany({
    where: {
      googleBusinessRefreshToken: { not: null },
      googleBusinessAccountId: { not: null },
      googleBusinessLocationId: { not: null },
    },
    select: { id: true },
  });

  const assigned = [];
  for (const company of companies) {
    try {
      assigned.push({
        companyId: company.id,
        ...(await syncAndAssignGbpReviews(company.id)),
      });
    } catch (error) {
      console.error("GBP review assignment sync failed", company.id, error);
      assigned.push({
        companyId: company.id,
        upserted: 0,
        error: error instanceof Error ? error.message : "failed",
      });
    }
  }

  const results = await notifyAllCompaniesOfNewGbpReviews();
  const notified = results.reduce((sum, row) => sum + (row.notified ?? 0), 0);

  return NextResponse.json({ ok: true, notified, results, assigned });
}
