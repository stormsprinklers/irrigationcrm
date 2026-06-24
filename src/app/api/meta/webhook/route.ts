import { NextRequest, NextResponse } from "next/server";
import {
  processMetaWebhookPayload,
  verifyMetaSignature,
  verifyMetaWebhookSubscription,
} from "@/lib/meta/webhook";
import { prisma } from "@/lib/prisma";

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
  const rawBody = await request.text();
  let body: Parameters<typeof processMetaWebhookPayload>[0];

  try {
    body = JSON.parse(rawBody) as Parameters<typeof processMetaWebhookPayload>[0];
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const signature = request.headers.get("x-hub-signature-256");
  const pageId = body.entry?.[0]?.id;

  if (pageId) {
    const company = await prisma.company.findFirst({
      where: {
        OR: [{ metaPageId: pageId }, { metaInstagramAccountId: pageId }],
      },
      select: { metaAppSecret: true },
    });

    if (company?.metaAppSecret) {
      const valid = verifyMetaSignature(rawBody, signature, company.metaAppSecret);
      if (!valid) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
      }
    }
  }

  await processMetaWebhookPayload(body);

  return NextResponse.json({ ok: true });
}
