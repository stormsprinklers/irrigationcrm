import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { processEstimateFollowUpJob } from "@/lib/notifications/estimate-followup";
import { notifyVisitEvent } from "@/lib/notifications/visit-events";
import type { NotificationEvent } from "@/lib/notifications/templates";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const jobs = await prisma.notificationJob.findMany({
    where: { processedAt: null, runAt: { lte: now } },
    take: 50,
  });

  let processed = 0;
  for (const job of jobs) {
    try {
      if (job.estimateId && job.event === "ESTIMATE_FOLLOW_UP") {
        await processEstimateFollowUpJob({
          jobId: job.id,
          estimateId: job.estimateId,
          companyId: job.companyId,
        });
      } else if (job.visitId) {
        await notifyVisitEvent({
          visitId: job.visitId,
          companyId: job.companyId,
          event: job.event as NotificationEvent,
        });
        await prisma.notificationJob.update({
          where: { id: job.id },
          data: { processedAt: new Date() },
        });
      } else {
        await prisma.notificationJob.update({
          where: { id: job.id },
          data: { processedAt: new Date() },
        });
        continue;
      }
      processed++;
    } catch (err) {
      console.error("Notification job failed:", job.id, err);
    }
  }

  return NextResponse.json({ processed, total: jobs.length });
}
