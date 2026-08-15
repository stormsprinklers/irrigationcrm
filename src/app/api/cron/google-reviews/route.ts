import { NextRequest, NextResponse } from "next/server";
import { notifyAllCompaniesOfNewGbpReviews } from "@/lib/google-business/review-staff-notifier";
import { syncAndAssignGbpReviews } from "@/lib/google-business/review-assigner";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await notifyAllCompaniesOfNewGbpReviews();
  const notified = results.reduce((sum, row) => sum + (row.notified ?? 0), 0);

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

  return NextResponse.json({ ok: true, notified, results, assigned });
}

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
