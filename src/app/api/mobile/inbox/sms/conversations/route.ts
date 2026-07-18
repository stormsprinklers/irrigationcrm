import { NextRequest, NextResponse } from "next/server";
import { Channel, Scope } from "@prisma/client";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { isFieldRole } from "@/lib/employees";
import { listEligibleCustomerIdsForFieldSms } from "@/lib/field/access";
import { prisma } from "@/lib/prisma";
import { isContactBlocked, normalizePhone } from "@/lib/inbox/contacts";
import { sendSms } from "@/lib/inbox/twilio";
import { outboundCommsErrorResponse } from "@/lib/communications/outbound-guard";
import { findOrCreateSmsConversation } from "@/lib/inbox/conversations";
import { findCustomerByPhone } from "@/lib/inbox/customer-lookup";
import { twilioSmsStatusCallbackUrl } from "@/lib/app-url";
import type { PendingAttachment } from "@/lib/inbox/attachments";
import { isBlobStorageUrl } from "@/lib/blob/urls";
import { pathnameFromBlobUrl, twilioAccessibleMediaUrl } from "@/lib/inbox/media-url";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser(request);

    const where: {
      companyId: string;
      channel: typeof Channel.SMS;
      scope: typeof Scope.EXTERNAL;
      customerId?: { in: string[] };
    } = {
      companyId: user.companyId,
      channel: Channel.SMS,
      scope: Scope.EXTERNAL,
    };

    if (isFieldRole(user.role)) {
      const eligible = await listEligibleCustomerIdsForFieldSms(user);
      if (!eligible.length) {
        return NextResponse.json([]);
      }
      where.customerId = { in: eligible };
    }

    const conversations = await prisma.conversation.findMany({
      where,
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
    const user = await requireSessionUser(request);
    const body = await request.json();
    const to = String(body.to ?? "");
    const messageBody = String(body.body ?? "");
    const customerId = body.customerId ? String(body.customerId) : undefined;
    const media = (Array.isArray(body.media) ? body.media : []) as PendingAttachment[];

    if (!to) return badRequestResponse("Recipient phone required");

    if (isFieldRole(user.role)) {
      const eligible = await listEligibleCustomerIdsForFieldSms(user);
      let resolvedCustomerId = customerId;
      if (!resolvedCustomerId) {
        const customer = await findCustomerByPhone(user.companyId, normalizePhone(to));
        resolvedCustomerId = customer?.id;
      }
      if (!resolvedCustomerId || !eligible.includes(resolvedCustomerId)) {
        return forbiddenResponse("Customer is outside your SMS access window");
      }
    }

    const company = await prisma.company.findUnique({ where: { id: user.companyId } });
    if (!company?.twilioPhone) return badRequestResponse("Twilio phone not configured");

    const normalizedTo = normalizePhone(to);
    const blocked = await isContactBlocked(user.companyId, normalizedTo, null);
    if (blocked) return forbiddenResponse("Contact is blocked");

    const mediaUrls = media
      .map((item) => {
        if (item.publicUrl?.includes("/api/twilio/mms/media")) return item.publicUrl;
        if (item.publicUrl && !isBlobStorageUrl(item.publicUrl)) return item.publicUrl;
        const pathname = pathnameFromBlobUrl(item.blobUrl);
        if (pathname) return twilioAccessibleMediaUrl(pathname);
        return item.publicUrl ?? item.blobUrl;
      })
      .filter(Boolean);

    if (!messageBody.trim() && !mediaUrls.length) {
      return badRequestResponse("Message body or media required");
    }

    let resolvedCustomerId = customerId;
    if (!resolvedCustomerId) {
      const customer = await findCustomerByPhone(user.companyId, normalizedTo);
      resolvedCustomerId = customer?.id;
    }

    const statusCallback = twilioSmsStatusCallbackUrl(request.nextUrl.origin);
    const twilioMessage = await sendSms({
      companyId: user.companyId,
      from: company.twilioPhone,
      to: normalizedTo,
      body: messageBody,
      mediaUrl: mediaUrls.length ? mediaUrls : undefined,
      statusCallback,
    });

    const conversation = await findOrCreateSmsConversation({
      companyId: user.companyId,
      scope: Scope.EXTERNAL,
      participantPhone: normalizedTo,
      customerId: resolvedCustomerId,
    });

    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: user.id,
        direction: "OUTBOUND",
        body: messageBody.trim() || (mediaUrls.length ? "[Media message]" : ""),
        twilioMessageSid: twilioMessage.sid,
        ...(media.length
          ? {
              media: {
                create: media.map((item) => ({
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

    return NextResponse.json({ conversation, message });
  } catch (error) {
    const commsDisabled = outboundCommsErrorResponse(error);
    if (commsDisabled) return commsDisabled;
    console.error(error);
    const message = error instanceof Error ? error.message : "Failed to send SMS";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
