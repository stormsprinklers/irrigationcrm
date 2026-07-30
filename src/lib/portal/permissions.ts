import type { PortalCompany } from "./company";
import {
  irrigationFeaturesEnabled,
  maintenancePlansFeaturesEnabled,
} from "@/lib/company/features";

export function portalFeatureEnabled(
  company: PortalCompany,
  feature:
    | "jobs"
    | "invoices"
    | "estimates"
    | "maintenance"
    | "checklists"
    | "rachio"
    | "offers"
    | "referrals"
    | "irrigation"
) {
  switch (feature) {
    case "jobs":
      return company.portalShowJobs;
    case "invoices":
      return company.portalShowInvoices;
    case "estimates":
      return company.portalShowEstimates;
    case "maintenance":
      return (
        maintenancePlansFeaturesEnabled(company) && company.portalShowMaintenance
      );
    case "checklists":
      return company.portalShowChecklists;
    case "irrigation":
      return irrigationFeaturesEnabled(company);
    case "rachio":
      return irrigationFeaturesEnabled(company) && company.portalShowRachio;
    case "offers":
      return company.portalShowOffers;
    case "referrals":
      return company.portalShowReferrals;
    default:
      return false;
  }
}

type OfferTargeting = {
  tags?: string[];
  zips?: string[];
};

export function offerMatchesCustomer(
  targeting: unknown,
  customer: { tags: string[]; zip?: string | null }
) {
  if (!targeting || typeof targeting !== "object") return true;
  const rules = targeting as OfferTargeting;
  if (rules.tags?.length) {
    const hasTag = rules.tags.some((t) => customer.tags.includes(t));
    if (!hasTag) return false;
  }
  if (rules.zips?.length && customer.zip) {
    if (!rules.zips.includes(customer.zip)) return false;
  }
  return true;
}
