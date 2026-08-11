import { NextRequest, NextResponse } from "next/server";
import { MessageDirection } from "@prisma/client";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { twilioSmsStatusCallbackUrl } from "@/lib/app-url";
import { isSmsNotDelivered } from "@/lib/inbox/sms-delivery";
import { sendSms } from "@/lib/inbox/twilio";
import { outboundCommsErrorResponse } from "@/lib/communications/outbound-guard";
import { prisma } from "@/lib/prisma";
import { pathnameFromBlobUrl, twilioAccessibleMediaUrl } from "@/lib/inbox/media-url";
import { isBlobStorageUrl } from "@/lib/blob/urls";

type Ctx = { params: Promise<{ messageId: string }> };

/**
 * Re-send a failed / undelivered outbound SMS as a new message in the same thread.
 */
export async function POST(_request: NextRequest, context: Ctx) {
  try {
    const user = await requireSessionUser();
    const { messageId } = await context.params;

    const original = await prisma.message.findFirst({
      where: { id: messageId },
      include: {
        media: true,
        conversation: {
          select: {
            id: true,
            companyId: true,
            participantPhone: true,
            channel: true,
          },
        },
      },
    });

    if (!original || original.conversation.companyId !== user.companyId) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }
    if (original.direction !== MessageDirection.OUTBOUND) {
      return badRequestResponse("Only outbound messages can be resent");
    }
    if (!isSmsNotDelivered(original.deliveryStatus)) {
      return badRequestResponse("Only failed or undelivered messages can be resent");
    }

    const to = original.conversation.participantPhone?.trim();
    if (!to) {
      return badRequestResponse("Conversation has no recipient phone number");
    }

    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: { twilioPhone: true },
    });
    if (!company?.twilioPhone) {
      return badRequestResponse(
        "No outbound SMS number configured — set a Primary phone number for this company"
      );
    }

    const mediaUrls = original.media
      .map((item) => {
        if (!isBlobStorageUrl(item.blobUrl)) return item.blobUrl;
        const pathname = pathnameFromBlobUrl(item.blobUrl);
        if (pathname) return twilioAccessibleMediaUrl(pathname);
        return item.blobUrl;
      })
      .filter(Boolean);

    const bodyText =
      original.body === "[Media message]" ? "" : original.body;

    let twilioMessage;
    try {
      twilioMessage = await sendSms({
        companyId: user.companyId,
        from: company.twilioPhone,
        to,
        body: bodyText,
        mediaUrl: mediaUrls.length ? mediaUrls : undefined,
        statusCallback: twilioSmsStatusCallbackUrl(),
      });
    } catch (err) {
      const outbound = outboundCommsErrorResponse(err);
      if (outbound) return outbound;
      const message = err instanceof Error ? err.message : "Failed to send SMS";
      return NextResponse.json({ error: message }, { status: 502 });
    }

    const message = await prisma.message.create({
      data: {
        conversationId: original.conversation.id,
        senderId: user.id,
        direction: "OUTBOUND",
        body: original.body,
        twilioMessageSid: twilioMessage.sid,
        deliveryStatus: "queued",
        ...(original.media.length
          ? {
              media: {
                create: original.media.map((item) => ({
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
      where: { id: original.conversation.id },
      data: { lastMessageAt: new Date() },
    });

    return NextResponse.json({ message, resentFromId: original.id });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    return forbiddenResponse();
  }
}
