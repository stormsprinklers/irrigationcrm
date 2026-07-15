import type { AdsDateRange } from "@/lib/marketing/ads-date-range";
import {
  getGoogleAdsAccessToken,
  GoogleAdsApiError,
  googleAdsSearchAll,
} from "@/lib/google-ads/client";
import { prisma } from "@/lib/prisma";

export type GoogleLsaLeadCandidate = {
  id: string;
  phoneNumber: string | null;
  leadType: string | null;
  leadStatus: string | null;
  creationDateTime: string | null;
  leadCharged: boolean;
};

function normalizeCustomerId(id: string) {
  return id.replace(/-/g, "").replace(/^customers\//, "");
}

/**
 * Fetch recent LSA leads (with contact phones) for caller-phone attribution.
 * Uses the same OAuth + developer token connection as the Ads dashboard.
 * Paginates Google Ads Search so attribution is not capped to a single page.
 */
export async function getGoogleLsaLeadCandidates(
  companyId: string,
  range: Pick<AdsDateRange, "startDate" | "endDate">
): Promise<GoogleLsaLeadCandidate[]> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      googleAdsCustomerId: true,
      googleAdsLoginCustomerId: true,
    },
  });
  if (!company?.googleAdsCustomerId) {
    throw new GoogleAdsApiError("Select a Google Ads account", 400);
  }

  const accessToken = await getGoogleAdsAccessToken(companyId);
  const customerId = normalizeCustomerId(company.googleAdsCustomerId);

  type LeadRow = {
    localServicesLead?: {
      id?: string;
      leadType?: string;
      leadStatus?: string;
      creationDateTime?: string;
      leadCharged?: boolean;
      contactDetails?: { phoneNumber?: string };
    };
  };

  const query = `
    SELECT
      local_services_lead.id,
      local_services_lead.lead_type,
      local_services_lead.lead_status,
      local_services_lead.creation_date_time,
      local_services_lead.lead_charged,
      local_services_lead.contact_details
    FROM local_services_lead
    WHERE local_services_lead.creation_date_time >= '${range.startDate} 00:00:00'
      AND local_services_lead.creation_date_time <= '${range.endDate} 23:59:59'
    ORDER BY local_services_lead.creation_date_time DESC
  `;

  const rows = await googleAdsSearchAll<LeadRow>(
    accessToken,
    customerId,
    query,
    company.googleAdsLoginCustomerId
  );

  return rows.map((row) => ({
    id: String(row.localServicesLead?.id ?? ""),
    phoneNumber: row.localServicesLead?.contactDetails?.phoneNumber ?? null,
    leadType: row.localServicesLead?.leadType ?? null,
    leadStatus: row.localServicesLead?.leadStatus ?? null,
    creationDateTime: row.localServicesLead?.creationDateTime ?? null,
    leadCharged: Boolean(row.localServicesLead?.leadCharged),
  }));
}
