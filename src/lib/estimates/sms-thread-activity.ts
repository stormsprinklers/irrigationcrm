import { MessageDirection, Scope } from "@prisma/client";
import { findOrCreateSmsConversation } from "@/lib/inbox/conversations";
import { estimateSentActivityStatus } from "@/lib/inbox/internal-activity";
import { normalizePhone } from "@/lib/inbox/phone";
import { prisma } from "@/lib/prisma";

/**
 * Add a staff-only activity row to the customer's SMS thread.
 * This writes directly to the inbox and never sends anything through Twilio.
 */
export async function recordEstimateSentInSmsThread(params: {
  companyId: string;
  customerId: string;
  customerPhone: string;
  estimateId: string;
  estimateNumber?: string | null;
  senderId?: string | null;
}) {
  const conversation = await findOrCreateSmsConversation({
    companyId: params.companyId,
    scope: Scope.EXTERNAL,
    participantPhone: normalizePhone(params.customerPhone),
    customerId: params.customerId,
  });
  const displayNumber = params.estimateNumber?.trim();
  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      senderId: params.senderId ?? null,
      direction: MessageDirection.OUTBOUND,
      body: displayNumber ? `Sent Estimate ${displayNumber}` : "Sent Estimate",
      deliveryStatus: estimateSentActivityStatus(params.estimateId),
    },
  });
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: message.sentAt },
  });
  return message;
}
