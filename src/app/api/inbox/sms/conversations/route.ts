import { NextRequest, NextResponse } from "next/server";
import { Scope, Channel } from "@prisma/client";
import {
  requireSessionUser,
  unauthorizedResponse,
  badRequestResponse,
  forbiddenResponse,
} from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { isContactBlocked, normalizePhone } from "@/lib/inbox/contacts";
import { sendSms } from "@/lib/inbox/twilio";
import { findOrCreateSmsConversation } from "@/lib/inbox/conversations";
import { findCustomerByPhone } from "@/lib/inbox/customer-lookup";
import { twilioSmsStatusCallbackUrl } from "@/lib/app-url";
import type { PendingAttachment } from "@/lib/inbox/attachments";
import { isBlobStorageUrl } from "@/lib/blob/urls";
import { pathnameFromBlobUrl, twilioAccessibleMediaUrl } from "@/lib/inbox/media-url";

type SendSmsBody = {
  to: string;
  body?: string;
  customerId?: string;
  scope?: string;
  title?: string;
  userId?: string;
  media?: PendingAttachment[];
};

async function sendSmsMessage(params: {
  user: { id: string; companyId: string };
  scope: Scope;
  to: string;
  messageBody: string;
  media: PendingAttachment[];
  statusCallback: string;
  customerId?: string;
  title?: string;
  userId?: string;
}) {
  const company = await prisma.company.findUnique({ where: { id: params.user.companyId } });
  if (!company?.twilioPhone) throw new Error("Twilio phone not configured");

  const normalizedTo = normalizePhone(params.to);
  const blocked = await isContactBlocked(params.user.companyId, normalizedTo, null);
  if (blocked) throw new Error("Contact is blocked");

  const mediaUrls = params.media
    .map((item) => {
      if (item.publicUrl?.includes("/api/twilio/mms/media")) return item.publicUrl;
      if (item.publicUrl && !isBlobStorageUrl(item.publicUrl)) return item.publicUrl;
      const pathname = pathnameFromBlobUrl(item.blobUrl);
      if (pathname) return twilioAccessibleMediaUrl(pathname);
      return item.publicUrl ?? item.blobUrl;
    })
    .filter(Boolean);

  if (!params.messageBody.trim() && !mediaUrls.length) {
    throw new Error("Message body or media required");
  }

  let resolvedCustomerId = params.customerId;
  if (params.scope === Scope.EXTERNAL && !resolvedCustomerId) {
    const customer = await findCustomerByPhone(params.user.companyId, normalizedTo);
    resolvedCustomerId = customer?.id;
  }

  let recipientTitle = params.title?.trim() || undefined;
  if (params.scope === Scope.INTERNAL && !recipientTitle && params.userId) {
    const employee = await prisma.user.findFirst({
      where: { id: params.userId, companyId: params.user.companyId },
      select: { name: true },
    });
    recipientTitle = employee?.name;
  }

  const twilioMessage = await sendSms({
    from: company.twilioPhone,
    to: normalizedTo,
    body: params.messageBody,
    mediaUrl: mediaUrls.length ? mediaUrls : undefined,
    statusCallback: params.statusCallback,
  });

  const conversation = await findOrCreateSmsConversation({
    companyId: params.user.companyId,
    scope: params.scope,
    participantPhone: normalizedTo,
    customerId: resolvedCustomerId,
    title: recipientTitle,
  });

  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      senderId: params.user.id,
      direction: "OUTBOUND",
      body: params.messageBody.trim() || (mediaUrls.length ? "[Media message]" : ""),
      twilioMessageSid: twilioMessage.sid,
      ...(params.media.length
        ? {
            media: {
              create: params.media.map((item) => ({
                blobUrl: item.blobUrl,
                fileName: item.fileName,
                mimeType: item.mimeType,
                sizeBytes: item.sizeBytes,
              })),
            },
          }
        : {}),
    },
    include: {
      media: true,
      sender: { select: { id: true, name: true, email: true } },
    },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date() },
  });

  return { conversation, message };
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const scopeParam = request.nextUrl.searchParams.get("scope") ?? "external";
    const scope = scopeParam === "internal" ? Scope.INTERNAL : Scope.EXTERNAL;

    const conversations = await prisma.conversation.findMany({
      where: {
        companyId: user.companyId,
        channel: Channel.SMS,
        scope,
      },
      include: {
        customer: true,
        messages: {
          orderBy: { sentAt: "desc" },
          take: 1,
          include: { media: true },
        },
      },
      orderBy: { lastMessageAt: "desc" },
    });

    return NextResponse.json(conversations);
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const body = (await request.json()) as SendSmsBody;
    const {
      to,
      body: messageBody = "",
      customerId,
      scope: scopeParam,
      title,
      userId,
      media = [],
    } = body;

    const scope = scopeParam === "internal" ? Scope.INTERNAL : Scope.EXTERNAL;
    const statusCallback = twilioSmsStatusCallbackUrl(request.nextUrl.origin);

    if (!to) return badRequestResponse("Recipient phone required");

    const result = await sendSmsMessage({
      user,
      scope,
      to,
      messageBody,
      media: Array.isArray(media) ? media : [],
      statusCallback,
      customerId,
      title,
      userId,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Failed to send SMS";
    if (message === "Contact is blocked") return forbiddenResponse(message);
    if (message.includes("required") || message.includes("configured")) {
      return badRequestResponse(message);
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
