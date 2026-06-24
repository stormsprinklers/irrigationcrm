import { Channel, Scope } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function findOrCreateSmsConversation(params: {
  companyId: string;
  scope: Scope;
  participantPhone?: string;
  customerId?: string;
  title?: string;
}) {
  if (params.scope === Scope.EXTERNAL && params.participantPhone) {
    const existing = await prisma.conversation.findFirst({
      where: {
        companyId: params.companyId,
        channel: Channel.SMS,
        scope: Scope.EXTERNAL,
        participantPhone: params.participantPhone,
      },
    });
    if (existing) return existing;
  }

  if (params.scope === Scope.INTERNAL && params.participantPhone) {
    const existing = await prisma.conversation.findFirst({
      where: {
        companyId: params.companyId,
        channel: Channel.SMS,
        scope: Scope.INTERNAL,
        participantPhone: params.participantPhone,
      },
    });
    if (existing) return existing;
  }

  if (params.scope === Scope.INTERNAL && params.title && !params.participantPhone) {
    const existing = await prisma.conversation.findFirst({
      where: {
        companyId: params.companyId,
        channel: Channel.INTERNAL_CHAT,
        scope: Scope.INTERNAL,
        title: params.title,
      },
    });
    if (existing) return existing;
  }

  return prisma.conversation.create({
    data: {
      companyId: params.companyId,
      channel:
        params.scope === Scope.INTERNAL && !params.participantPhone
          ? Channel.INTERNAL_CHAT
          : Channel.SMS,
      scope: params.scope,
      participantPhone: params.participantPhone,
      customerId: params.customerId,
      title: params.title,
    },
  });
}

export async function getCompanyByTwilioPhone(phone: string) {
  const direct = await prisma.company.findFirst({
    where: { twilioPhone: phone },
  });
  if (direct) return direct;

  const normalized = phone.startsWith("+") ? phone : phone;
  const tracked = await prisma.phoneNumber.findFirst({
    where: { e164: normalized },
    include: { company: true },
  });
  return tracked?.company ?? null;
}

export async function getCompanyBySendGridAddress(email: string) {
  return prisma.company.findFirst({
    where: {
      OR: [{ sendgridFrom: email }, { sendgridFrom: { contains: email.split("@")[1] } }],
    },
  });
}
