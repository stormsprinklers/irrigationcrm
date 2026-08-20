import { Channel, Scope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  normalizePhone,
  phoneDigitsKey,
  phoneLookupVariants,
} from "@/lib/inbox/phone";

export async function findSmsConversationByPhone(params: {
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

/** Prefer an existing thread so replies land in the same inbox tab as outbound. */
export async function findExistingSmsConversationAnyScope(params: {
  companyId: string;
  participantPhone: string;
}) {
  const external = await findSmsConversationByPhone({
    companyId: params.companyId,
    scope: Scope.EXTERNAL,
    participantPhone: params.participantPhone,
  });
  if (external) return external;

  return findSmsConversationByPhone({
    companyId: params.companyId,
    scope: Scope.INTERNAL,
    participantPhone: params.participantPhone,
  });
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

export type InboundSmsLine = {
  company: {
    id: string;
    name: string;
    twilioPhone: string | null;
  };
  phoneNumber: {
    id: string;
    e164: string;
    friendlyName: string | null;
    trackingSource: string | null;
    isPrimary: boolean;
    numberType: string;
  } | null;
  /** True when the dialed line is this company's Primary (or matches company.twilioPhone). */
  isPrimaryLine: boolean;
};

/**
 * Resolve which company owns the Twilio "To" number.
 * PhoneNumber rows are the source of truth so tracking / agent lines still land
 * in that company's shared SMS inbox (replies go out on Primary).
 */
export async function resolveInboundSmsLine(phone: string): Promise<InboundSmsLine | null> {
  const variants = phoneLookupVariants(phone);
  const last10 = phoneDigitsKey(phone);

  const phoneNumber = await prisma.phoneNumber.findFirst({
    where: {
      OR: [
        ...variants.map((e164) => ({ e164 })),
        ...(last10 && last10.length === 10 ? [{ e164: { endsWith: last10 } }] : []),
      ],
    },
    include: {
      company: { select: { id: true, name: true, twilioPhone: true } },
    },
    orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }],
  });

  if (phoneNumber?.company) {
    const dialed = normalizePhone(phoneNumber.e164);
    const companyPrimary = phoneNumber.company.twilioPhone
      ? normalizePhone(phoneNumber.company.twilioPhone)
      : null;
    const isPrimaryLine =
      phoneNumber.isPrimary ||
      phoneNumber.numberType === "PRIMARY" ||
      (companyPrimary != null && companyPrimary === dialed);
    return {
      company: phoneNumber.company,
      phoneNumber: {
        id: phoneNumber.id,
        e164: phoneNumber.e164,
        friendlyName: phoneNumber.friendlyName,
        trackingSource: phoneNumber.trackingSource,
        isPrimary: phoneNumber.isPrimary,
        numberType: phoneNumber.numberType,
      },
      isPrimaryLine,
    };
  }

  const company = await prisma.company.findFirst({
    where: {
      OR: [
        ...variants.map((twilioPhone) => ({ twilioPhone })),
        ...(last10 && last10.length === 10
          ? [{ twilioPhone: { endsWith: last10 } }]
          : []),
      ],
    },
    select: { id: true, name: true, twilioPhone: true },
  });
  if (!company) return null;

  return {
    company,
    phoneNumber: null,
    isPrimaryLine: true,
  };
}

export async function getCompanyByTwilioPhone(phone: string) {
  const resolved = await resolveInboundSmsLine(phone);
  return resolved?.company ?? null;
}

export async function getCompanyBySendGridAddress(email: string) {
  return prisma.company.findFirst({
    where: {
      OR: [{ sendgridFrom: email }, { sendgridFrom: { contains: email.split("@")[1] } }],
    },
  });
}

/** Staff-visible note when a text hit a non-primary line (still same company inbox). */
export function inboundSmsViaLinePrefix(line: InboundSmsLine): string | null {
  if (line.isPrimaryLine || !line.phoneNumber) return null;
  const label =
    line.phoneNumber.friendlyName?.trim() ||
    line.phoneNumber.trackingSource?.trim() ||
    normalizePhone(line.phoneNumber.e164);
  return `[Via ${label}]`;
}
