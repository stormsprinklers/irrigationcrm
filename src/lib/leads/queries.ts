import { AttributionFirstTouchMethod, LeadStatus, Prisma } from "@prisma/client";
import { copyLeadFirstTouchToCustomer, recordTouchEvent } from "@/lib/attribution";
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

export async function convertLeadToCustomer(companyId: string, leadId: string) {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, companyId },
  });
  if (!lead) return null;
  if (lead.convertedCustomerId) {
    return prisma.customer.findUnique({ where: { id: lead.convertedCustomerId } });
  }

  const customer = await prisma.$transaction(async (tx) => {
    const created = await tx.customer.create({
      data: {
        companyId,
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        leadSource: lead.source,
      },
    });
    await tx.lead.update({
      where: { id: leadId },
      data: { convertedCustomerId: created.id, status: LeadStatus.WON },
    });
    return created;
  });

  await copyLeadFirstTouchToCustomer(leadId, customer.id).catch(() => {});
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
