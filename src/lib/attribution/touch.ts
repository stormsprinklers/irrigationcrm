import {
  AttributionFirstTouchMethod,
  Prisma,
  type MarketingTouchEvent,
} from "@prisma/client";
import { leadPhoneKey } from "@/lib/leads/contact-status";
import { prisma } from "@/lib/prisma";
import {
  firstTouchCustomerData,
  firstTouchLeadData,
  normalizeAttribution,
  type AttributionInput,
  type NormalizedAttribution,
} from "@/lib/attribution/normalize";

export type TouchEventInput = {
  companyId: string;
  eventType: string;
  method: AttributionFirstTouchMethod;
  attribution?: AttributionInput;
  normalized?: NormalizedAttribution;
  customerId?: string | null;
  leadId?: string | null;
  callLogId?: string | null;
  conversationId?: string | null;
  sessionId?: string | null;
  phone?: string | null;
  pagePath?: string | null;
  occurredAt?: Date;
  metadata?: Record<string, unknown>;
  /** When true, attempt to stamp first-touch on lead and/or customer. Default true. */
  stampFirstTouch?: boolean;
};

export type ResolvePersonByPhoneResult = {
  customerId: string | null;
  leadId: string | null;
};

/**
 * Find the best matching customer and/or open lead for a phone number.
 */
export async function resolvePersonByPhone(
  companyId: string,
  phone: string | null | undefined
): Promise<ResolvePersonByPhoneResult> {
  const key = leadPhoneKey(phone);
  if (!key) return { customerId: null, leadId: null };

  const [customers, phones, leads] = await Promise.all([
    prisma.customer.findMany({
      where: { companyId, phone: { not: null } },
      select: { id: true, phone: true },
      take: 500,
      orderBy: { createdAt: "desc" },
    }),
    prisma.customerPhone.findMany({
      where: { companyId, phone: { contains: key } },
      select: { customerId: true, phone: true },
      take: 50,
    }),
    prisma.lead.findMany({
      where: {
        companyId,
        phone: { not: null },
        convertedCustomerId: null,
        status: { not: "SPAM" },
      },
      select: { id: true, phone: true },
      take: 200,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  let customerId: string | null = null;
  for (const row of phones) {
    if (leadPhoneKey(row.phone) === key) {
      customerId = row.customerId;
      break;
    }
  }
  if (!customerId) {
    for (const row of customers) {
      if (leadPhoneKey(row.phone) === key) {
        customerId = row.id;
        break;
      }
    }
  }

  let leadId: string | null = null;
  for (const row of leads) {
    if (leadPhoneKey(row.phone) === key) {
      leadId = row.id;
      break;
    }
  }

  return { customerId, leadId };
}

function hasFirstTouch(row: {
  attributionChannel: string | null;
  firstTouchAt: Date | null;
}): boolean {
  return Boolean(row.attributionChannel || row.firstTouchAt);
}

/**
 * Stamp first-touch fields on a lead if they are empty. Never overwrites.
 */
export async function stampLeadFirstTouch(
  leadId: string,
  normalized: NormalizedAttribution,
  method: AttributionFirstTouchMethod,
  occurredAt: Date = new Date()
) {
  const existing = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      attributionChannel: true,
      firstTouchAt: true,
      source: true,
    },
  });
  if (!existing || hasFirstTouch(existing)) {
    return { stamped: false as const };
  }

  await prisma.lead.update({
    where: { id: leadId },
    data: firstTouchLeadData(normalized, method, occurredAt, existing.source),
  });
  return { stamped: true as const };
}

/**
 * Stamp first-touch fields on a customer if they are empty. Never overwrites.
 */
export async function stampCustomerFirstTouch(
  customerId: string,
  normalized: NormalizedAttribution,
  method: AttributionFirstTouchMethod,
  occurredAt: Date = new Date()
) {
  const existing = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      attributionChannel: true,
      firstTouchAt: true,
      leadSource: true,
    },
  });
  if (!existing || hasFirstTouch(existing)) {
    return { stamped: false as const };
  }

  await prisma.customer.update({
    where: { id: customerId },
    data: firstTouchCustomerData(normalized, method, occurredAt),
  });
  return { stamped: true as const };
}

/**
 * Copy first-touch from a lead onto a customer only if the customer has none.
 */
export async function copyLeadFirstTouchToCustomer(leadId: string, customerId: string) {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      attributionChannel: true,
      attributionSource: true,
      attributionMedium: true,
      attributionCampaign: true,
      attributionTerm: true,
      attributionContent: true,
      gclid: true,
      fbclid: true,
      msclkid: true,
      firstTouchAt: true,
      firstTouchMethod: true,
      source: true,
    },
  });
  if (!lead?.attributionChannel && !lead?.firstTouchAt) {
    // Fall back: stamp from coarse source if present
    if (lead?.source) {
      const normalized = normalizeAttribution({ leadSource: lead.source, formSource: lead.source });
      return stampCustomerFirstTouch(
        customerId,
        normalized,
        AttributionFirstTouchMethod.FORM,
        new Date()
      );
    }
    return { stamped: false as const };
  }

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { attributionChannel: true, firstTouchAt: true },
  });
  if (!customer || hasFirstTouch(customer)) {
    return { stamped: false as const };
  }

  await prisma.customer.update({
    where: { id: customerId },
    data: {
      attributionChannel: lead.attributionChannel,
      attributionSource: lead.attributionSource,
      attributionMedium: lead.attributionMedium,
      attributionCampaign: lead.attributionCampaign,
      attributionTerm: lead.attributionTerm,
      attributionContent: lead.attributionContent,
      gclid: lead.gclid,
      fbclid: lead.fbclid,
      msclkid: lead.msclkid,
      firstTouchAt: lead.firstTouchAt,
      firstTouchMethod: lead.firstTouchMethod,
      leadSource: lead.source ?? lead.attributionChannel,
    },
  });
  return { stamped: true as const };
}

/**
 * Always append an audit touch event; optionally stamp first-touch on linked entities.
 */
export async function recordTouchEvent(
  input: TouchEventInput
): Promise<{ event: MarketingTouchEvent; stampedLead: boolean; stampedCustomer: boolean }> {
  const normalized = input.normalized ?? normalizeAttribution(input.attribution ?? {});
  const occurredAt = input.occurredAt ?? new Date();
  const stamp = input.stampFirstTouch !== false;

  const event = await prisma.marketingTouchEvent.create({
    data: {
      companyId: input.companyId,
      customerId: input.customerId ?? null,
      leadId: input.leadId ?? null,
      callLogId: input.callLogId ?? null,
      conversationId: input.conversationId ?? null,
      sessionId: input.sessionId ?? null,
      eventType: input.eventType,
      channel: normalized.channel,
      source: normalized.source,
      medium: normalized.medium,
      campaign: normalized.campaign,
      term: normalized.term,
      content: normalized.content,
      gclid: normalized.gclid,
      fbclid: normalized.fbclid,
      msclkid: normalized.msclkid,
      trackingSource: normalized.trackingSource,
      phone: input.phone ? leadPhoneKey(input.phone) : null,
      pagePath: input.pagePath ?? null,
      occurredAt,
      metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });

  let stampedLead = false;
  let stampedCustomer = false;

  if (stamp) {
    if (input.leadId) {
      const result = await stampLeadFirstTouch(input.leadId, normalized, input.method, occurredAt);
      stampedLead = result.stamped;
    }
    if (input.customerId) {
      const result = await stampCustomerFirstTouch(
        input.customerId,
        normalized,
        input.method,
        occurredAt
      );
      stampedCustomer = result.stamped;
    }
  }

  return { event, stampedLead, stampedCustomer };
}
