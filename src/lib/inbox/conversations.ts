import { Channel, Scope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/inbox/phone";

async function findSmsConversationByPhone(params: {
  companyId: string;
  scope: Scope;
  participantPhone: string;
}) {
  const normalized = normalizePhone(params.participantPhone);
  const digits = normalized.replace(/\D/g, "").slice(-10);

  const candidates = await prisma.conversation.findMany({
    where: {
      companyId: params.companyId,
      channel: Channel.SMS,
      scope: params.scope,
      participantPhone: { not: null },
    },
    orderBy: { lastMessageAt: "desc" },
    take: 50,
  });

  return (
    candidates.find((row) => {
      if (!row.participantPhone) return false;
      const rowNormalized = normalizePhone(row.participantPhone);
      if (rowNormalized === normalized) return true;
      return digits.length >= 10 && rowNormalized.replace(/\D/g, "").endsWith(digits);
    }) ?? null
  );
}

export async function findOrCreateSmsConversation(params: {
  companyId: string;
  scope: Scope;
  participantPhone?: string;
  customerId?: string;
  title?: string;
}) {
  const normalizedPhone = params.participantPhone
    ? normalizePhone(params.participantPhone)
    : undefined;

  if (params.scope === Scope.EXTERNAL && normalizedPhone) {
    const existing = await findSmsConversationByPhone({
      companyId: params.companyId,
      scope: Scope.EXTERNAL,
      participantPhone: normalizedPhone,
    });
    if (existing) {
      const needsUpdate =
        existing.participantPhone !== normalizedPhone ||
        (params.customerId && !existing.customerId);
      if (needsUpdate) {
        return prisma.conversation.update({
          where: { id: existing.id },
          data: {
            participantPhone: normalizedPhone,
            ...(params.customerId && !existing.customerId
              ? { customerId: params.customerId }
              : {}),
          },
        });
      }
      return existing;
    }
  }

  if (params.scope === Scope.INTERNAL && normalizedPhone) {
    const existing = await findSmsConversationByPhone({
      companyId: params.companyId,
      scope: Scope.INTERNAL,
      participantPhone: normalizedPhone,
    });
    if (existing) {
      const needsUpdate =
        existing.participantPhone !== normalizedPhone ||
        (params.title && !existing.title);
      if (needsUpdate) {
        return prisma.conversation.update({
          where: { id: existing.id },
          data: {
            participantPhone: normalizedPhone,
            ...(params.title && !existing.title ? { title: params.title } : {}),
          },
        });
      }
      return existing;
    }
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
      participantPhone: normalizedPhone ?? params.participantPhone,
      customerId: params.customerId,
      title: params.title,
    },
  });
}

export async function getCompanyByTwilioPhone(phone: string) {
  const normalized = normalizePhone(phone);

  const direct = await prisma.company.findFirst({
    where: {
      OR: [{ twilioPhone: phone }, { twilioPhone: normalized }],
    },
  });
  if (direct) return direct;

  const tracked = await prisma.phoneNumber.findFirst({
    where: {
      OR: [{ e164: phone }, { e164: normalized }],
    },
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
