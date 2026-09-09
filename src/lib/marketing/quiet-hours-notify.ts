import { AppNotificationType, UserRole } from "@prisma/client";
import {
  clampToCampaignSendWindow,
  isWithinCampaignSendWindow,
} from "@/lib/communications/send-window";
import { notifyStaffInApp } from "@/lib/notifications/in-app";
import { resolveNotificationTimezone } from "@/lib/notifications/timezone";
import { prisma } from "@/lib/prisma";

const DEDUPE_MS = 10 * 60 * 60 * 1000;

function formatLocalClock(at: Date, timeZone?: string | null) {
  const tz = resolveNotificationTimezone(timeZone);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
  }).format(at);
}

/**
 * Tell company admins that campaign email/SMS was held for overnight quiet hours
 * (9:00 PM–8:00 AM local). Deduped per campaign so cron ticks do not spam.
 */
export async function notifyAdminsCampaignQuietHours(params: {
  companyId: string;
  campaignId: string;
  campaignName: string;
  resumeAt: Date;
  timeZone?: string | null;
}): Promise<void> {
  const href = `/marketing/campaigns/${params.campaignId}`;
  const since = new Date(Date.now() - DEDUPE_MS);
  const existing = await prisma.appNotification.findFirst({
    where: {
      companyId: params.companyId,
      type: AppNotificationType.CAMPAIGN_QUIET_HOURS,
      href,
      createdAt: { gte: since },
    },
    select: { id: true },
  });
  if (existing) return;

  const admins = await prisma.user.findMany({
    where: { companyId: params.companyId, status: "ACTIVE", role: UserRole.ADMIN },
    select: { id: true },
  });
  if (!admins.length) return;

  const resume = formatLocalClock(params.resumeAt, params.timeZone);
  await notifyStaffInApp({
    companyId: params.companyId,
    userIds: admins.map((admin) => admin.id),
    type: AppNotificationType.CAMPAIGN_QUIET_HOURS,
    title: "Campaign send paused overnight",
    body: `"${params.campaignName}" cannot send between 9:00 PM and 8:00 AM local time. Sends resume at ${resume}.`,
    href,
  });
}

/**
 * If `when` is inside the campaign window, return it.
 * Otherwise hold until 8:00 AM. Notify admins when a send that was due now is blocked.
 */
export async function scheduleOrHoldCampaignSend(params: {
  companyId: string;
  campaignId: string;
  campaignName: string;
  timeZone?: string | null;
  when?: Date;
}): Promise<Date> {
  const when = params.when ?? new Date();
  if (isWithinCampaignSendWindow(when, params.timeZone)) return when;
  const resumeAt = clampToCampaignSendWindow(when, params.timeZone);
  const dueNow = when.getTime() <= Date.now() + 60_000;
  if (dueNow) {
    await notifyAdminsCampaignQuietHours({
      companyId: params.companyId,
      campaignId: params.campaignId,
      campaignName: params.campaignName,
      resumeAt,
      timeZone: params.timeZone,
    });
  }
  return resumeAt;
}
