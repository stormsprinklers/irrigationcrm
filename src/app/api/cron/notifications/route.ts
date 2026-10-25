import { notifyEstimateViaTemplates } from "@/lib/notifications/estimate-notify";
import { onEstimateSent } from "@/lib/notifications/estimate-followup";
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
      if (!job.event.startsWith("ESTIMATE_SCHEDULED_SEND:") && !isWithinAutomatedSendWindow(now, tz)) {
        await prisma.notificationJob.update({
          where: { id: job.id },
          data: { runAt: clampToAutomatedSendWindow(now, tz) },
        });
        deferred++;
        continue;
      }

      if (job.estimateId && job.event.startsWith("ESTIMATE_SCHEDULED_SEND:")) {
        const payload = JSON.parse(job.event.slice("ESTIMATE_SCHEDULED_SEND:".length)) as {channel:"sms"|"email"|"both";message:string;subject?:string};
        const claim = await prisma.notificationJob.updateMany({where:{id:job.id,processedAt:null},data:{processedAt:new Date()}});
        if (!claim.count) continue;
        try {
          const result = await notifyEstimateViaTemplates(job.estimateId,job.companyId,payload.channel,payload);
          if (!result.emailSent && !result.smsSent) throw new Error("Scheduled estimate delivery failed");
        } catch (error) {
          await prisma.notificationJob.update({where:{id:job.id},data:{processedAt:null,runAt:new Date(Date.now()+5*60*1000)}});
          throw error;
        }
        await prisma.estimate.updateMany({where:{id:job.estimateId,companyId:job.companyId,status:{in:["DRAFT","SENT"]}},data:{status:"SENT",sentAt:new Date()}});
        await onEstimateSent(job.estimateId,job.companyId);
      } else if (job.estimateId && job.event === "ESTIMATE_FOLLOW_UP") {
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
