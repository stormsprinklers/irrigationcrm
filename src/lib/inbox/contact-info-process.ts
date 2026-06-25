import { prisma } from "@/lib/prisma";
import { messageSharesContactInfo } from "@/lib/inbox/contact-info-detection";
import { extractContactInfoFromSmsMessage } from "@/lib/inbox/contact-info-extraction";
import {
  isParsedSmsContactInfo,
  withDefaultPhone,
  type ParsedSmsContactInfo,
} from "@/lib/inbox/contact-info-types";

export async function processInboundMessageContactInfo(messageId: string) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      body: true,
      direction: true,
      contactInfoDetected: true,
      parsedContactInfo: true,
      conversation: {
        select: {
          participantPhone: true,
          scope: true,
        },
      },
    },
  });

  if (!message || message.direction !== "INBOUND") return;
  if (message.conversation.scope !== "EXTERNAL") return;

  const detected = messageSharesContactInfo(message.body);
  if (!detected) return;

  await prisma.message.update({
    where: { id: messageId },
    data: { contactInfoDetected: true },
  });

  if (message.parsedContactInfo && isParsedSmsContactInfo(message.parsedContactInfo)) {
    return;
  }

  try {
    const parsed = await extractContactInfoFromSmsMessage(message.body);
    await prisma.message.update({
      where: { id: messageId },
      data: { parsedContactInfo: parsed },
    });
  } catch (error) {
    console.error("SMS contact info extraction failed", { messageId, error });
  }
}

export async function ensureMessageContactInfoParsed(
  messageId: string,
  fallbackPhone: string | null | undefined
): Promise<ParsedSmsContactInfo | null> {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      body: true,
      contactInfoDetected: true,
      parsedContactInfo: true,
    },
  });

  if (!message?.contactInfoDetected) return null;

  if (message.parsedContactInfo && isParsedSmsContactInfo(message.parsedContactInfo)) {
    return withDefaultPhone(message.parsedContactInfo, fallbackPhone);
  }

  const parsed = await extractContactInfoFromSmsMessage(message.body);
  await prisma.message.update({
    where: { id: messageId },
    data: { parsedContactInfo: parsed },
  });

  return withDefaultPhone(parsed, fallbackPhone);
}
