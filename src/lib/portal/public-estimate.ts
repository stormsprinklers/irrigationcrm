import { prisma } from "@/lib/prisma";
import { portalCompanySelect, type PortalCompany } from "./company";
import { portalFeatureEnabled } from "./permissions";

const estimateLineItemsInclude = {
  lineItems: {
    orderBy: { sortOrder: "asc" as const },
    include: { priceBookItem: { select: { type: true } } },
  },
  options: { orderBy: { sortOrder: "asc" as const } },
  discounts: true,
  visit: {
    select: {
      id: true,
      title: true,
      startAt: true,
      endAt: true,
      assignedUser: { select: { name: true, photoUrl: true, title: true } },
    },
  },
};

/**
 * Resolve a customer estimate by public token for unauthenticated link access
 * (SMS / email estimate links). Token is a secret cuid in the URL.
 */
export async function findEstimateByPublicToken(token: string) {
  const estimate = await prisma.estimate.findFirst({
    where: {
      publicToken: token,
      status: { not: "DRAFT" },
      company: { portalEnabled: true },
    },
    include: {
      ...estimateLineItemsInclude,
      company: { select: portalCompanySelect },
    },
  });
  if (!estimate) return null;
  if (!portalFeatureEnabled(estimate.company, "estimates")) return null;
  return estimate;
}

export function portalCompanyPayload(company: PortalCompany) {
  return {
    name: company.name,
    emailLogoUrl: company.emailLogoUrl,
    estimateWarrantyText: company.estimateWarrantyText ?? null,
    features: {
      jobs: portalFeatureEnabled(company, "jobs"),
      invoices: portalFeatureEnabled(company, "invoices"),
      estimates: portalFeatureEnabled(company, "estimates"),
      maintenance: portalFeatureEnabled(company, "maintenance"),
      checklists: portalFeatureEnabled(company, "checklists"),
      rachio: portalFeatureEnabled(company, "rachio"),
      offers: portalFeatureEnabled(company, "offers"),
      referrals: portalFeatureEnabled(company, "referrals"),
      allowSchedule: company.portalAllowSchedule,
      rachioAllowRun: company.portalRachioAllowRun,
    },
  };
}
