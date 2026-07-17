import { AppNotificationType, Scope, UserRole } from "@prisma/client";
import {
  websiteLeadFormLabel,
  websiteLeadNotificationTitle,
} from "@/lib/leads/form-labels";
import { prisma } from "@/lib/prisma";
import { sendStaffPush } from "@/lib/push/send";

const STAFF_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.CSR,
  UserRole.SALES,
];

const FIELD_ROLES: UserRole[] = [UserRole.TECH, UserRole.INSTALLER];

export async function notifyStaffInApp(params: {
  companyId: string;
  type: AppNotificationType;
  title: string;
  body?: string | null;
  href?: string | null;
  userIds?: string[];
  conversationId?: string;
}) {
  const where =
    params.userIds && params.userIds.length
      ? {
          companyId: params.companyId,
          status: "ACTIVE" as const,
          id: { in: params.userIds },
        }
      : {
          companyId: params.companyId,
          status: "ACTIVE" as const,
          role: { in: STAFF_ROLES },
        };

  const staff = await prisma.user.findMany({
    where,
    select: { id: true },
  });

  if (!staff.length) return;

  await prisma.appNotification.createMany({
    data: staff.map((user) => ({
      companyId: params.companyId,
      userId: user.id,
      type: params.type,
      title: params.title,
      body: params.body ?? null,
      href: params.href ?? null,
    })),
  });

  await sendStaffPush({
    companyId: params.companyId,
    userIds: staff.map((user) => user.id),
    title: params.title,
    body: params.body,
    href: params.href,
    conversationId: params.conversationId,
  });
}

export async function notifyInboundEmail(params: {
  companyId: string;
  emailId: string;
  fromEmail: string;
  subject: string;
}) {
  await notifyStaffInApp({
    companyId: params.companyId,
    type: AppNotificationType.INBOX_EMAIL,
    title: `New email from ${params.fromEmail}`,
    body: params.subject,
    href: `/inbox/leads?emailId=${params.emailId}`,
  });
}

export async function notifyInboundSms(params: {
  companyId: string;
  conversationId: string;
  fromLabel: string;
  preview: string;
  scope?: Scope;
  participantPhone?: string | null;
  fromPhone?: string | null;
}) {
  const title = `New text from ${params.fromLabel}`;
  const body = params.preview.slice(0, 160);
  const href = `/inbox/sms/customers?conversationId=${params.conversationId}`;

  let notifyUserIds: string[] = [];

  if (params.scope === Scope.INTERNAL) {
    const lookupPhone = params.fromPhone ?? params.participantPhone;
    const employee = lookupPhone
      ? await prisma.user.findFirst({
          where: {
            companyId: params.companyId,
            status: "ACTIVE",
            phone: lookupPhone,
          },
          select: { id: true },
        })
      : null;
    if (employee) {
      notifyUserIds = [employee.id];
    } else {
      const fieldStaff = await prisma.user.findMany({
        where: {
          companyId: params.companyId,
          status: "ACTIVE",
          role: { in: [...FIELD_ROLES, UserRole.ADMIN] },
        },
        select: { id: true },
      });
      notifyUserIds = fieldStaff.map((user) => user.id);
    }
  } else {
    const staff = await prisma.user.findMany({
      where: {
        companyId: params.companyId,
        status: "ACTIVE",
        role: { in: STAFF_ROLES },
      },
      select: { id: true },
    });
    notifyUserIds = staff.map((user) => user.id);
  }

  await notifyStaffInApp({
    companyId: params.companyId,
    type: AppNotificationType.INBOX_SMS,
    title,
    body,
    href,
    userIds: notifyUserIds,
    conversationId: params.conversationId,
  });
}

export async function notifyWebsiteFormInbox(params: {
  companyId: string;
  emailId?: string | null;
  conversationId?: string | null;
  name: string;
  source?: string | null;
  body?: string | null;
}) {
  const formLabel = websiteLeadFormLabel(params.source);
  const title = websiteLeadNotificationTitle(params.source, params.name);
  const body =
    params.body?.trim() ||
    `New website ${formLabel.toLowerCase()} submission`;

  if (params.emailId) {
    await notifyStaffInApp({
      companyId: params.companyId,
      type: AppNotificationType.INBOX_LEAD,
      title,
      body,
      href: `/inbox/leads?emailId=${params.emailId}`,
    });
    return;
  }

  if (params.conversationId) {
    await notifyStaffInApp({
      companyId: params.companyId,
      type: AppNotificationType.INBOX_LEAD,
      title,
      body,
      href: `/inbox/leads?conversationId=${params.conversationId}`,
    });
    return;
  }

  // No inbox thread yet — still notify staff (push + bell).
  await notifyStaffInApp({
    companyId: params.companyId,
    type: AppNotificationType.INBOX_LEAD,
    title,
    body,
    href: "/customers/leads",
  });
}
