import { MessageDirection, Prisma, Scope } from "@prisma/client";
import { findOrCreateSmsConversation } from "@/lib/inbox/conversations";
import { normalizePhone } from "@/lib/inbox/phone";
import { prisma } from "@/lib/prisma";

/**
 * Keep every customer-facing SMS in the shared CRM thread, including automated
 * confirmations and payment/estimate notifications sent outside the inbox UI.
 */
export async function recordOutboundCustomerSms(params: {
  companyId: string;
  to: string;
  body: string;
  twilioMessageSid: string;
  customerId?: string | null;
  senderId?: string | null;
}) {
  const conversation = await findOrCreateSmsConversation({
    companyId: params.companyId,
    scope: Scope.EXTERNAL,
    participantPhone: normalizePhone(params.to),
    customerId: params.customerId ?? undefined,
  });

  try {
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: params.senderId ?? null,
        direction: MessageDirection.OUTBOUND,
        body: params.body,
        twilioMessageSid: params.twilioMessageSid,
        deliveryStatus: "queued",
      },
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: message.sentAt,
        smsOpen: true,
        smsClosedAt: null,
        smsClosedById: null,
      },
    });
    return { conversation, message };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const message = await prisma.message.findUnique({
        where: { twilioMessageSid: params.twilioMessageSid },
      });
      return { conversation, message };
    }
    throw error;
  }
}
