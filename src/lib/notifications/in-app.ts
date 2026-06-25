import { AppNotificationType, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const STAFF_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.CSR,
  UserRole.SALES,
];

export async function notifyStaffInApp(params: {
  companyId: string;
  type: AppNotificationType;
  title: string;
  body?: string | null;
  href?: string | null;
}) {
  const staff = await prisma.user.findMany({
    where: {
      companyId: params.companyId,
      status: "ACTIVE",
      role: { in: STAFF_ROLES },
    },
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
}) {
  await notifyStaffInApp({
    companyId: params.companyId,
    type: AppNotificationType.INBOX_SMS,
    title: `New text from ${params.fromLabel}`,
    body: params.preview.slice(0, 160),
    href: `/inbox/sms/customers?conversationId=${params.conversationId}`,
  });
}

export async function notifyWebsiteFormInbox(params: {
  companyId: string;
  emailId?: string | null;
  conversationId?: string | null;
  name: string;
  source?: string | null;
}) {
  const label = params.source ?? "website form";
  if (params.emailId) {
    await notifyStaffInApp({
      companyId: params.companyId,
      type: AppNotificationType.INBOX_LEAD,
      title: `Website form: ${params.name}`,
      body: label,
      href: `/inbox/leads?emailId=${params.emailId}`,
    });
    return;
  }

  if (params.conversationId) {
    await notifyStaffInApp({
      companyId: params.companyId,
      type: AppNotificationType.INBOX_LEAD,
      title: `Website form: ${params.name}`,
      body: label,
      href: `/inbox/leads?conversationId=${params.conversationId}`,
    });
  }
}
