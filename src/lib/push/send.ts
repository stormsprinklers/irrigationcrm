import { sendMobilePushToUsers } from "@/lib/mobile-push/devices";
import { sendWebPushToUsers } from "@/lib/web-push/subscriptions";

/** Fan out to native iOS APNs and web push (installed PWA) subscribers. */
export async function sendStaffPush(params: {
  userIds: string[];
  companyId: string;
  title: string;
  body?: string | null;
  href?: string | null;
  conversationId?: string;
  visitId?: string;
  customerId?: string;
  estimateId?: string;
  type?: string;
  deepLink?: string;
}) {
  await Promise.all([
    sendMobilePushToUsers({
      userIds: params.userIds,
      companyId: params.companyId,
      title: params.title,
      body: params.body,
      conversationId: params.conversationId,
      visitId: params.visitId,
      customerId: params.customerId,
      estimateId: params.estimateId,
      type: params.type,
      deepLink: params.deepLink,
    }),
    sendWebPushToUsers({
      userIds: params.userIds,
      companyId: params.companyId,
      title: params.title,
      body: params.body,
      href: params.href,
    }),
  ]);
}
