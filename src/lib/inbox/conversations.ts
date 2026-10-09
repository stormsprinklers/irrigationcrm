import { Channel, Prisma, Scope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  normalizePhone,
  phoneDigitsKey,
  phoneLookupVariants,
  phonesMatch,
} from "@/lib/inbox/phone";
import { findCustomerByPhone } from "@/lib/inbox/customer-lookup";

export async function findSmsConversationByPhone(params: {
  companyId: string;
  scope: Scope;
  participantPhone: string;
}) {
  const normalized = normalizePhone(params.participantPhone);
  const digits = normalized.replace(/\D/g, "").slice(-10);
  const exact = await prisma.conversation.findMany({
    where: {
      companyId: params.companyId,
      channel: Channel.SMS,
      scope: params.scope,
      participantPhone: { in: phoneLookupVariants(params.participantPhone) },
    },
    orderBy: { lastMessageAt: "desc" },
  });
  if (exact.length) return exact[0];

  if (digits.length < 10) return null;
  const matches = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id
    FROM "Conversation"
    WHERE "companyId" = ${params.companyId}
      AND channel::text = 'SMS'
      AND scope::text = ${params.scope}
      AND "participantPhone" IS NOT NULL
      AND right(regexp_replace("participantPhone", '[^0-9]', '', 'g'), 10) = ${digits}
    ORDER BY "lastMessageAt" DESC
  `);
  if (!matches.length) return null;

  return prisma.conversation.findFirst({
    where: { id: { in: matches.map((row) => row.id) } },
    orderBy: { lastMessageAt: "desc" },
  });
}

async function findSmsConversationMatches(
  tx: Prisma.TransactionClient,
  params: { companyId: string; scope: Scope; participantPhone: string }
) {
  const digits = phoneDigitsKey(params.participantPhone);
  if (digits?.length === 10) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id
      FROM "Conversation"
      WHERE "companyId" = ${params.companyId}
        AND channel::text = 'SMS'
        AND scope::text = ${params.scope}
        AND "participantPhone" IS NOT NULL
        AND right(regexp_replace("participantPhone", '[^0-9]', '', 'g'), 10) = ${digits}
    `);
    if (!rows.length) return [];
    return tx.conversation.findMany({
      where: { id: { in: rows.map((row) => row.id) } },
      orderBy: { createdAt: "asc" },
    });
  }

  return tx.conversation.findMany({
    where: {
      companyId: params.companyId,
      channel: Channel.SMS,
      scope: params.scope,
      participantPhone: { in: phoneLookupVariants(params.participantPhone) },
    },
    orderBy: { createdAt: "asc" },
  });
}

async function mergeSmsConversationMatches(
  tx: Prisma.TransactionClient,
  matches: Awaited<ReturnType<typeof findSmsConversationMatches>>,
  params: {
    normalizedPhone: string;
    customerId?: string | null;
    title?: string;
  }
) {
  const canonical = matches[0];
  if (!canonical) return null;
  const duplicates = matches.slice(1);
  const mostRecent = [...matches].sort(
    (a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime()
  );
  const openState = matches.some((row) => row.smsOpen === true)
    ? true
    : matches.every((row) => row.smsOpen === false)
      ? false
      : null;
  const closed = mostRecent.find((row) => row.smsClosedAt);

  if (duplicates.length) {
    const duplicateIds = duplicates.map((row) => row.id);
    await tx.message.updateMany({
      where: { conversationId: { in: duplicateIds } },
      data: { conversationId: canonical.id },
    });
    await tx.conversation.deleteMany({ where: { id: { in: duplicateIds } } });
  }

  return tx.conversation.update({
    where: { id: canonical.id },
    data: {
      participantPhone: params.normalizedPhone,
      customerId:
        params.customerId ?? matches.find((row) => row.customerId)?.customerId ?? null,
      title:
        params.title?.trim() || mostRecent.find((row) => row.title?.trim())?.title || null,
      lastMessageAt: mostRecent[0]?.lastMessageAt ?? canonical.lastMessageAt,
      smsOpen: openState,
      smsClosedAt: openState === false ? closed?.smsClosedAt ?? null : null,
      smsClosedById: openState === false ? closed?.smsClosedById ?? null : null,
    },
  });
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

/** Link by phone; never keep a customer whose number is a different person. */
export async function nextCustomerIdForSmsPhone(params: {
  companyId: string;
  participantPhone: string;
  currentCustomerId?: string | null;
}): Promise<string | null> {
  const matched = await findCustomerByPhone(params.companyId, params.participantPhone);
  if (matched) return matched.id;

  if (!params.currentCustomerId) return null;

  const linked = await prisma.customer.findFirst({
    where: { id: params.currentCustomerId, companyId: params.companyId },
    select: { phone: true },
  });
  if (!linked) return null;
  if (linked.phone && !phonesMatch(linked.phone, params.participantPhone)) {
    return null;
  }
  return params.currentCustomerId;
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

  if (normalizedPhone) {
    const nextCustomerId =
      params.scope === Scope.EXTERNAL
        ? await nextCustomerIdForSmsPhone({
            companyId: params.companyId,
            participantPhone: normalizedPhone,
            currentCustomerId: params.customerId,
          })
        : params.customerId ?? null;
    const lockKey = `sms:${params.companyId}:${params.scope}:${phoneDigitsKey(normalizedPhone) ?? normalizedPhone}`;

    return prisma.$transaction(async (tx) => {
      // Advisory locks return PostgreSQL's `void` type. `$queryRaw` tries to
      // deserialize that value and fails before the conversation can be saved.
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);
      let matches = await findSmsConversationMatches(tx, {
        companyId: params.companyId,
        scope: params.scope,
        participantPhone: normalizedPhone,
      });
      if (!matches.length) {
        const created = await tx.conversation.create({
          data: {
            companyId: params.companyId,
            channel: Channel.SMS,
            scope: params.scope,
            participantPhone: normalizedPhone,
            customerId: nextCustomerId,
            title: params.title,
            ...(params.scope === Scope.EXTERNAL ? { smsOpen: true } : {}),
          },
        });
        matches = [created];
      }
      const merged = await mergeSmsConversationMatches(tx, matches, {
        normalizedPhone,
        customerId: nextCustomerId,
        title: params.title,
      });
      if (!merged) throw new Error("Failed to create SMS conversation");
      return merged;
    });
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
      ...(params.scope === Scope.EXTERNAL ? { smsOpen: true } : {}),
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
  if (!resolved) return null;
  // Voice routing needs the full Company row (recordCalls, businessHours, etc.).
  return prisma.company.findUnique({ where: { id: resolved.company.id } });
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
