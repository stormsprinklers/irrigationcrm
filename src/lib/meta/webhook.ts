import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

export function generateMetaVerifyToken() {
  return randomBytes(24).toString("hex");
}

export function maskSecret(value: string | null | undefined) {
  if (!value) return null;
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export async function verifyMetaWebhookSubscription(searchParams: URLSearchParams) {
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode !== "subscribe" || !token || !challenge) {
    return { ok: false as const, status: 400 };
  }

  const company = await prisma.company.findFirst({
    where: { metaWebhookVerifyToken: token },
    select: { id: true },
  });

  if (!company) {
    return { ok: false as const, status: 403 };
  }

  await prisma.company.update({
    where: { id: company.id },
    data: { metaWebhookVerifiedAt: new Date() },
  });

  return { ok: true as const, challenge };
}

export function verifyMetaSignature(rawBody: string, signatureHeader: string | null, appSecret: string) {
  if (!signatureHeader?.startsWith("sha256=") || !appSecret) return false;

  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const received = signatureHeader.slice("sha256=".length);

  try {
    return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(received, "utf8"));
  } catch {
    return false;
  }
}

type MetaWebhookBody = {
  object?: string;
  entry?: Array<{
    id?: string;
    time?: number;
    changes?: Array<{ field?: string; value?: unknown }>;
    messaging?: unknown[];
  }>;
};

export async function processMetaWebhookPayload(body: MetaWebhookBody) {
  const entries = body.entry ?? [];
  const stored: string[] = [];

  for (const entry of entries) {
    const pageId = entry.id;
    if (!pageId) continue;

    const company = await prisma.company.findFirst({
      where: { metaPageId: pageId },
      select: { id: true },
    });

    if (!company) continue;

    const changeField = entry.changes?.[0]?.field ?? (entry.messaging ? "messages" : null);

    await prisma.metaWebhookEvent.create({
      data: {
        companyId: company.id,
        object: body.object ?? null,
        field: changeField,
        payload: body as object,
      },
    });

    stored.push(company.id);
  }

  return stored;
}
