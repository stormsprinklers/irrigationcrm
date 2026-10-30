import { IntegrationType } from "@prisma/client";
import { normalizePhone } from "@/lib/inbox/phone";
import { prisma } from "@/lib/prisma";
import { advanceCustomerPipeline } from "@/lib/customers/pipeline";
import type { AffiliateCustomerInput } from "@/lib/affiliate/payload";
export { parseAffiliateCustomerPayload } from "@/lib/affiliate/payload";

export async function createAffiliateCustomer(params: {
  companyId: string;
  affiliateUserId: string;
  input: AffiliateCustomerInput;
}) {
  const affiliate = await prisma.user.findFirst({
    where: {
      id: params.affiliateUserId,
      companyId: params.companyId,
      role: "AFFILIATE",
      status: "ACTIVE",
    },
    select: { id: true },
  });
  if (!affiliate) throw new Error("Affiliate integration is not active");

  const createdAt = new Date();
  const name = `${params.input.firstName} ${params.input.lastName}`.trim();
  const leadSource = params.input.leadSource || "Affiliate";
  const phone = params.input.phone ? normalizePhone(params.input.phone) : null;
  const email = params.input.email ? params.input.email.toLowerCase() : null;

  const customer = await prisma.customer.create({
    data: {
      companyId: params.companyId,
      affiliateUserId: affiliate.id,
      name,
      phone,
      email,
      address: params.input.address || null,
      leadSource,
      notes: params.input.notes
        ? { create: { authorId: affiliate.id, body: params.input.notes } }
        : undefined,
    },
    select: { id: true, name: true, createdAt: true },
  });

  const addedToPipeline = await advanceCustomerPipeline({
    companyId: params.companyId,
    customerId: customer.id,
    stage: "LEAD",
    occurredAt: createdAt,
    leadSource,
  });
  if (!addedToPipeline) {
    throw new Error("Customer was created but could not be added to the pipeline");
  }

  return customer;
}

export async function getAffiliateCredentialSummary(userId: string, companyId: string) {
  return prisma.integrationCredential.findMany({
    where: {
      ownerUserId: userId,
      companyId,
      type: IntegrationType.AFFILIATE,
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      label: true,
      keyPrefix: true,
      enabled: true,
      lastUsedAt: true,
      createdAt: true,
    },
  });
}
