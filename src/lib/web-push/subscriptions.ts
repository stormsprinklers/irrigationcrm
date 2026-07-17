import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import {
  getVapidPrivateKey,
  getVapidPublicKey,
  getVapidSubject,
  isWebPushConfigured,
} from "@/lib/web-push/config";

let vapidConfigured = false;

function ensureVapid() {
  if (vapidConfigured) return;
  if (!isWebPushConfigured()) {
    throw new Error("Web Push VAPID keys are not configured");
  }
  webpush.setVapidDetails(getVapidSubject(), getVapidPublicKey(), getVapidPrivateKey());
  vapidConfigured = true;
}

export async function upsertWebPushSubscription(params: {
  userId: string;
  companyId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}) {
  const endpoint = params.endpoint.trim();
  if (!endpoint) throw new Error("endpoint is required");

  return prisma.webPushSubscription.upsert({
    where: { endpoint },
    create: {
      userId: params.userId,
      companyId: params.companyId,
      endpoint,
      p256dh: params.p256dh,
      auth: params.auth,
      userAgent: params.userAgent ?? null,
    },
    update: {
      userId: params.userId,
      companyId: params.companyId,
      p256dh: params.p256dh,
      auth: params.auth,
      userAgent: params.userAgent ?? null,
    },
  });
}

export async function deleteWebPushSubscription(params: {
  userId: string;
  endpoint: string;
}) {
  await prisma.webPushSubscription.deleteMany({
    where: {
      userId: params.userId,
      endpoint: params.endpoint.trim(),
    },
  });
}

export async function sendWebPushToUsers(params: {
  userIds: string[];
  companyId: string;
  title: string;
  body?: string | null;
  href?: string | null;
}) {
  if (!isWebPushConfigured()) return;

  const uniqueUserIds = [...new Set(params.userIds.filter(Boolean))];
  if (!uniqueUserIds.length) return;

  ensureVapid();

  const subscriptions = await prisma.webPushSubscription.findMany({
    where: {
      companyId: params.companyId,
      userId: { in: uniqueUserIds },
    },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });

  if (!subscriptions.length) return;

  const payload = JSON.stringify({
    title: params.title,
    body: params.body ?? "",
    href: params.href ?? "/home",
  });

  const staleIds: string[] = [];

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
          { TTL: 60 * 60 * 12, urgency: "high" }
        );
      } catch (error) {
        const statusCode =
          error && typeof error === "object" && "statusCode" in error
            ? Number((error as { statusCode?: number }).statusCode)
            : null;
        if (statusCode === 404 || statusCode === 410) {
          staleIds.push(sub.id);
        } else {
          console.error("Web push send failed", sub.endpoint.slice(0, 48), error);
        }
      }
    })
  );

  if (staleIds.length) {
    await prisma.webPushSubscription.deleteMany({
      where: { id: { in: staleIds } },
    });
  }
}
