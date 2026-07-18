import { AppNotificationType } from "@prisma/client";
import { notifyStaffInApp } from "@/lib/notifications/in-app";
import { sendMobilePushToUsers } from "@/lib/mobile-push/devices";

/** Typed field/ops notifications with deep-link payloads for iOS. */
export async function notifyFieldEvent(params: {
  companyId: string;
  userIds: string[];
  type: AppNotificationType;
  title: string;
  body?: string | null;
  visitId?: string;
  customerId?: string;
  conversationId?: string;
  estimateId?: string;
}) {
  const href = params.visitId
    ? `/schedule?visitId=${params.visitId}`
    : params.conversationId
      ? `/inbox/sms/customers?conversationId=${params.conversationId}`
      : params.estimateId
        ? `/estimates/${params.estimateId}`
        : params.customerId
          ? `/customers/${params.customerId}`
          : null;

  const deepLink = params.visitId
    ? `stormcrm://visit/${params.visitId}`
    : params.conversationId
      ? `stormcrm://conversation/${params.conversationId}`
      : params.estimateId
        ? `stormcrm://estimate/${params.estimateId}`
        : params.customerId
          ? `stormcrm://customer/${params.customerId}`
          : undefined;

  await notifyStaffInApp({
    companyId: params.companyId,
    type: params.type,
    title: params.title,
    body: params.body,
    href,
    userIds: params.userIds,
    conversationId: params.conversationId,
  });

  if (deepLink) {
    await sendMobilePushToUsers({
      userIds: params.userIds,
      companyId: params.companyId,
      title: params.title,
      body: params.body,
      conversationId: params.conversationId,
      visitId: params.visitId,
      customerId: params.customerId,
      estimateId: params.estimateId,
      type: params.type,
      deepLink,
    });
  }
}
