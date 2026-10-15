import { NextResponse } from "next/server";
import {
  clampToAutomatedSendWindow,
  isWithinAutomatedSendWindow,
} from "@/lib/communications/send-window";
import { prisma } from "@/lib/prisma";
import { processEstimateFollowUpJob } from "@/lib/notifications/estimate-followup";
import { notifyVisitEvent } from "@/lib/notifications/visit-events";
import { holdUntilCompletedDelay } from "@/lib/notifications/jobs";
import type { NotificationEvent } from "@/lib/notifications/templates";
import { authorizeCronRequest } from "@/lib/security/trusted-request";

export async function GET(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;

  const now = new Date();
  const expiredImportantUpdates = await prisma.importantUpdate.deleteMany({
    where: { expiresAt: { lte: now } },
  });
  const jobs = await prisma.notificationJob.findMany({
    where: { processedAt: null, runAt: { lte: now } },
    take: 50,
  });

  const timezoneByCompany = new Map<string, string | null>();

  async function timezoneFor(companyId: string) {
    if (timezoneByCompany.has(companyId)) return timezoneByCompany.get(companyId) ?? null;
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { timezone: true },
    });
    const tz = company?.timezone ?? null;
    timezoneByCompany.set(companyId, tz);
    return tz;
  }

  let processed = 0;
  let deferred = 0;
  for (const job of jobs) {
    try {
      const tz = await timezoneFor(job.companyId);
      if (!isWithinAutomatedSendWindow(now, tz)) {
        await prisma.notificationJob.update({
          where: { id: job.id },
          data: { runAt: clampToAutomatedSendWindow(now, tz) },
        });
        deferred++;
        continue;
      }

      if (job.estimateId && job.event === "ESTIMATE_FOLLOW_UP") {
        await processEstimateFollowUpJob({
          jobId: job.id,
          estimateId: job.estimateId,
          companyId: job.companyId,
        });
      } else if (job.visitId) {
        const hold = await holdUntilCompletedDelay({
          visitId: job.visitId,
          companyId: job.companyId,
          event: job.event,
          now,
        });
        if (hold.action === "cancel") {
          await prisma.notificationJob.update({
            where: { id: job.id },
            data: { processedAt: new Date() },
          });
          continue;
        }
        if (hold.action === "hold") {
          await prisma.notificationJob.update({
            where: { id: job.id },
            data: { runAt: hold.runAt },
          });
          deferred++;
          continue;
        }
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

  return NextResponse.json({
    processed,
    deferred,
    total: jobs.length,
    expiredImportantUpdates: expiredImportantUpdates.count,
  });
}
