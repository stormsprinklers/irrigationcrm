import { AttributionFirstTouchMethod, LeadStatus, Prisma } from "@prisma/client";
import { copyLeadFirstTouchToCustomer, recordTouchEvent } from "@/lib/attribution";
import { parseLeadServiceAddress } from "@/lib/leads/address-from-notes";
import { findCustomerByPhone } from "@/lib/inbox/customer-lookup";
import { normalizePhone } from "@/lib/inbox/phone";
import { prisma } from "@/lib/prisma";

export const leadInclude = {
  assignedUser: { select: { id: true, name: true, color: true } },
  convertedCustomer: { select: { id: true, name: true } },
} satisfies Prisma.LeadInclude;

type LeadPayload = Prisma.LeadGetPayload<{ include: typeof leadInclude }>;

export function serializeLead(lead: LeadPayload) {
  return {
    id: lead.id,
    name: lead.name,
    phone: lead.phone,
    email: lead.email,
    source: lead.source,
    status: lead.status,
    notes: lead.notes,
    assignedUser: lead.assignedUser,
    convertedCustomer: lead.convertedCustomer,
    contactedAt: lead.contactedAt?.toISOString() ?? null,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
  };
}

export async function listLeads(companyId: string, filters?: { search?: string; status?: LeadStatus }) {
  const where: Prisma.LeadWhereInput = {
    companyId,
    // Careers applications live in Hiring, not Customers → Leads
    AND: [
      {
        NOT: {
          OR: [
            { source: { equals: "careers", mode: "insensitive" } },
            { externalId: { startsWith: "careers:" } },
          ],
        },
      },
    ],
  };
  if (filters?.status) where.status = filters.status;
  if (filters?.search) {
    where.OR = [
      { name: { contains: filters.search, mode: "insensitive" } },
      { email: { contains: filters.search, mode: "insensitive" } },
      { phone: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  const leads = await prisma.lead.findMany({
    where,
    include: leadInclude,
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return leads.map(serializeLead);
}

export async function ensureLeadHasContact(
  companyId: string,
  leadId: string,
  options: { markWon?: boolean } = {}
) {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, companyId },
  });
  if (!lead) return null;
  if (lead.convertedCustomerId) {
    if (options.markWon && lead.status !== LeadStatus.WON) {
      await prisma.lead.update({
        where: { id: leadId },
        data: { status: LeadStatus.WON },
      });
    }
    return prisma.customer.findUnique({ where: { id: lead.convertedCustomerId } });
  }

  const serviceAddress = parseLeadServiceAddress(lead.notes, lead.metadata);
  const phone = lead.phone?.trim() ? normalizePhone(lead.phone) : null;
  const email = lead.email?.trim().toLowerCase() || null;

  let existing = phone ? await findCustomerByPhone(companyId, phone) : null;
  if (!existing && email) {
    const primaryEmailMatch = await prisma.customer.findFirst({
      where: { companyId, email: { equals: email, mode: "insensitive" } },
      select: { id: true, name: true, phone: true, email: true, doNotService: true },
    });
    const secondaryEmailMatch = primaryEmailMatch
      ? null
      : await prisma.customerEmail.findFirst({
          where: { companyId, email: { equals: email, mode: "insensitive" } },
          include: {
            customer: {
              select: { id: true, name: true, phone: true, email: true, doNotService: true },
            },
          },
        });
    existing = primaryEmailMatch ?? secondaryEmailMatch?.customer ?? null;
  }

  const customer = await prisma.$transaction(async (tx) => {
    const contact = existing
      ? await tx.customer.update({
          where: { id: existing.id },
          data: {
            ...(!existing.phone && phone ? { phone } : {}),
            ...(!existing.email && email ? { email } : {}),
          },
        })
      : await tx.customer.create({
          data: {
            companyId,
            name: lead.name,
            phone,
            email,
            leadSource: lead.source,
            address: serviceAddress.address,
            city: serviceAddress.city,
            state: serviceAddress.state,
            zip: serviceAddress.zip,
          },
        });
    if (serviceAddress.address) {
      const existingProperty = await tx.customerProperty.findFirst({
        where: {
          companyId,
          customerId: contact.id,
          address: { equals: serviceAddress.address, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (!existingProperty) {
        await tx.customerProperty.create({
          data: {
            companyId,
            customerId: contact.id,
            name: "Primary",
            address: serviceAddress.address,
            city: serviceAddress.city,
            state: serviceAddress.state,
            zip: serviceAddress.zip,
            isPrimary: !existing,
          },
        });
      }
    }
    await tx.lead.update({
      where: { id: leadId },
      data: {
        convertedCustomerId: contact.id,
        ...(options.markWon ? { status: LeadStatus.WON } : {}),
      },
    });
    return contact;
  });

  await copyLeadFirstTouchToCustomer(leadId, customer.id).catch(() => {});
  return customer;
}

export async function convertLeadToCustomer(companyId: string, leadId: string) {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, companyId } });
  if (!lead) return null;

  const customer = await ensureLeadHasContact(companyId, leadId, { markWon: true });
  if (!customer) return null;

  recordTouchEvent({
    companyId,
    leadId,
    customerId: customer.id,
    eventType: "LEAD_CONVERT",
    method: AttributionFirstTouchMethod.FORM,
    attribution: {
      leadSource: lead.source,
      formSource: lead.source,
      source: lead.attributionSource,
      medium: lead.attributionMedium,
      campaign: lead.attributionCampaign,
      term: lead.attributionTerm,
      content: lead.attributionContent,
      gclid: lead.gclid,
      fbclid: lead.fbclid,
      msclkid: lead.msclkid,
    },
    phone: lead.phone,
    stampFirstTouch: false,
    metadata: { fromLeadId: leadId },
  }).catch(() => {});

  const { onReferralLeadConverted } = await import("@/lib/referrals/conversion");
  await onReferralLeadConverted({ companyId, leadId, customerId: customer.id }).catch(() => {});

  return customer;
}
