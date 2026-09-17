import { MessageDirection, Prisma, Scope } from "@prisma/client";
import { findOrCreateSmsConversation } from "@/lib/inbox/conversations";
import { normalizePhone } from "@/lib/inbox/phone";
import { prisma } from "@/lib/prisma";

/** Store the exact outbound text so replies have campaign context in the SMS inbox. */
export async function recordCampaignSmsInThread(params: {
  companyId: string;
  customerId?: string | null;
  phone: string;
  body: string;
  twilioMessageSid: string;
}) {
  try {
    if (await prisma.message.findUnique({ where: { twilioMessageSid: params.twilioMessageSid }, select: { id: true } })) return;
    const conversation = await findOrCreateSmsConversation({
      companyId: params.companyId,
      scope: Scope.EXTERNAL,
      participantPhone: normalizePhone(params.phone),
      customerId: params.customerId ?? undefined,
    });
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: MessageDirection.OUTBOUND,
        body: params.body,
        twilioMessageSid: params.twilioMessageSid,
        deliveryStatus: "queued",
      },
    });
    await prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: message.sentAt } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return;
    // Twilio has already accepted the text. Keep the campaign send successful
    // and let the status callback update delivery rather than sending twice.
    console.error("Could not add campaign SMS to inbox", error);
  }
}
