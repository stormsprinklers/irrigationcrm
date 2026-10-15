import { NextRequest, NextResponse } from "next/server";
import {
  processMetaWebhookPayload,
  verifyMetaSignature,
  verifyMetaWebhookSubscription,
} from "@/lib/meta/webhook";
import { prisma } from "@/lib/prisma";
import {
  beginWebhookEvent,
  completeWebhookEvent,
  failWebhookEvent,
  payloadEventId,
} from "@/lib/security/webhook-replay";

const MAX_WEBHOOK_BYTES = 1024 * 1024;

export async function GET(request: NextRequest) {
  const result = await verifyMetaWebhookSubscription(request.nextUrl.searchParams);

  if (!result.ok) {
    return new NextResponse("Forbidden", { status: result.status });
  }

  return new NextResponse(result.challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody) > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  let body: Parameters<typeof processMetaWebhookPayload>[0];

  try {
    body = JSON.parse(rawBody) as Parameters<typeof processMetaWebhookPayload>[0];
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const signature = request.headers.get("x-hub-signature-256");
  const pageId = body.entry?.[0]?.id;

  if (!pageId) {
    return NextResponse.json({ error: "Missing page identity" }, { status: 400 });
  }
  const company = await prisma.company.findFirst({
    where: {
      OR: [{ metaPageId: pageId }, { metaInstagramAccountId: pageId }],
    },
    select: { metaAppSecret: true },
  });
  if (!company?.metaAppSecret) {
    return NextResponse.json({ error: "Webhook is not configured" }, { status: 503 });
  }
  const valid = verifyMetaSignature(rawBody, signature, company.metaAppSecret);
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  const claim = await beginWebhookEvent("meta", payloadEventId(rawBody));
  if (claim.duplicate) return NextResponse.json({ ok: true, duplicate: true });
  try {
    await processMetaWebhookPayload(body);
    await completeWebhookEvent(claim.key);
    return NextResponse.json({ ok: true });
  } catch (error) {
    await failWebhookEvent(claim.key, error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
