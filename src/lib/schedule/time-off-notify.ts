import { AppNotificationType, UserRole } from "@prisma/client";
import { format } from "date-fns";
import { notifyStaffInApp } from "@/lib/notifications/in-app";
import { prisma } from "@/lib/prisma";

const REVIEWER_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.MANAGER, UserRole.CSR];

const TYPE_LABELS: Record<string, string> = {
  TIME_OFF: "Time off",
  PTO: "PTO",
  SICK: "Sick",
  OTHER: "Other",
};

export const TIME_OFF_TEAM_HREF = "/schedule?panel=team";

export function formatTimeOffRange(startAt: Date, endAt: Date) {
  const startLabel = format(startAt, "MMM d");
  const sameDay = startAt.toDateString() === endAt.toDateString();
  if (sameDay) return startLabel;
  return `${startLabel} – ${format(endAt, "MMM d")}`;
}

export async function notifyTimeOffRequestSubmitted(params: {
  companyId: string;
  employeeUserId: string;
  employeeName: string;
  startAt: Date;
  endAt: Date;
  type: string;
  reason?: string | null;
}) {
  const reviewers = await prisma.user.findMany({
    where: {
      companyId: params.companyId,
      status: "ACTIVE",
      role: { in: REVIEWER_ROLES },
      id: { not: params.employeeUserId },
    },
    select: { id: true },
  });
  if (!reviewers.length) return;

  const range = formatTimeOffRange(params.startAt, params.endAt);
  const typeLabel = TYPE_LABELS[params.type] ?? "Time off";
  const reason = params.reason?.trim();

  await notifyStaffInApp({
    companyId: params.companyId,
    type: AppNotificationType.TIME_OFF_REQUEST,
    title: `${params.employeeName} requested time off`,
    body: reason ? `${range} · ${typeLabel} · ${reason}` : `${range} · ${typeLabel}`,
    href: TIME_OFF_TEAM_HREF,
    userIds: reviewers.map((user) => user.id),
  });
}
