import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

type ClaimRow = { key: string };

function receiptKey(provider: string, eventId: string) {
  return createHash("sha256").update(`${provider}\0${eventId}`).digest("hex");
}

export function payloadEventId(payload: string | Buffer) {
  return createHash("sha256").update(payload).digest("hex");
}

export async function beginWebhookEvent(provider: string, eventId: string) {
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + 5 * 60 * 1000);
  const expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  const key = receiptKey(provider, eventId);
  const rows = await prisma.$queryRaw<ClaimRow[]>`
    INSERT INTO "WebhookEventReceipt"
      ("key", "provider", "eventId", "status", "attempts", "leaseUntil", "expiresAt", "createdAt", "updatedAt")
    VALUES
      (${key}, ${provider}, ${eventId.slice(0, 255)}, 'PROCESSING', 1, ${leaseUntil}, ${expiresAt}, ${now}, ${now})
    ON CONFLICT ("key") DO UPDATE SET
      "status" = 'PROCESSING',
      "attempts" = "WebhookEventReceipt"."attempts" + 1,
      "leaseUntil" = ${leaseUntil},
      "lastError" = NULL,
      "updatedAt" = ${now}
    WHERE "WebhookEventReceipt"."status" = 'FAILED'
       OR ("WebhookEventReceipt"."status" = 'PROCESSING' AND "WebhookEventReceipt"."leaseUntil" < ${now})
    RETURNING "key"
  `;
  return rows.length === 1 ? { key, duplicate: false } : { key, duplicate: true };
}

export async function completeWebhookEvent(key: string) {
  await prisma.webhookEventReceipt.update({
    where: { key },
    data: { status: "COMPLETED", processedAt: new Date(), leaseUntil: null, lastError: null },
  });
}

export async function failWebhookEvent(key: string, error: unknown) {
  const message = error instanceof Error ? error.name : "WebhookProcessingError";
  await prisma.webhookEventReceipt.update({
    where: { key },
    data: { status: "FAILED", leaseUntil: null, lastError: message.slice(0, 120) },
  }).catch(() => {});
}
