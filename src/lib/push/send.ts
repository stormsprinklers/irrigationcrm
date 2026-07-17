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
}) {
  await Promise.all([
    sendMobilePushToUsers({
      userIds: params.userIds,
      companyId: params.companyId,
      title: params.title,
      body: params.body,
      conversationId: params.conversationId,
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
