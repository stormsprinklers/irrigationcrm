import { prisma } from "@/lib/prisma";
import { sendApnsNotification, isApnsConfigured } from "@/lib/mobile-push/apns";

export async function registerMobilePushDevice(params: {
  userId: string;
  companyId: string;
  deviceToken: string;
  platform?: string;
  bundleId?: string | null;
}) {
  const token = params.deviceToken.trim();
  if (!token) throw new Error("deviceToken is required");

  return prisma.mobilePushDevice.upsert({
    where: { deviceToken: token },
    create: {
      userId: params.userId,
      companyId: params.companyId,
      deviceToken: token,
      platform: params.platform ?? "ios",
      bundleId: params.bundleId ?? null,
    },
    update: {
      userId: params.userId,
      companyId: params.companyId,
      platform: params.platform ?? "ios",
      bundleId: params.bundleId ?? null,
    },
  });
}

export async function unregisterMobilePushDevice(params: {
  userId: string;
  deviceToken: string;
}) {
  await prisma.mobilePushDevice.deleteMany({
    where: {
      userId: params.userId,
      deviceToken: params.deviceToken.trim(),
    },
  });
}

export async function sendMobilePushToUsers(params: {
  userIds: string[];
  companyId: string;
  title: string;
  body?: string | null;
  conversationId?: string;
  visitId?: string;
  customerId?: string;
  estimateId?: string;
  type?: string;
  deepLink?: string;
}) {
  if (!isApnsConfigured()) return;
  const uniqueUserIds = [...new Set(params.userIds.filter(Boolean))];
  if (!uniqueUserIds.length) return;

  const devices = await prisma.mobilePushDevice.findMany({
    where: {
      companyId: params.companyId,
      userId: { in: uniqueUserIds },
      platform: "ios",
    },
    select: { id: true, deviceToken: true },
  });

  if (!devices.length) return;

  const staleDeviceIds: string[] = [];

  await Promise.all(
    devices.map(async (device) => {
      const result = await sendApnsNotification(device.deviceToken, {
        alert: { title: params.title, body: params.body },
        conversationId: params.conversationId,
        visitId: params.visitId,
        customerId: params.customerId,
        estimateId: params.estimateId,
        type: params.type,
        deepLink: params.deepLink,
        badge: 1,
      });

      if (!result.ok && (result.status === 410 || result.reason === "BadDeviceToken" || result.reason === "Unregistered")) {
        staleDeviceIds.push(device.id);
      }
    })
  );

  if (staleDeviceIds.length) {
    await prisma.mobilePushDevice.deleteMany({
      where: { id: { in: staleDeviceIds } },
    });
  }
}
