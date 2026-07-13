import type { AdsDateRange } from "@/lib/marketing/ads-date-range";
import {
  getGoogleAdsAccessToken,
  GoogleAdsApiError,
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
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim();
  if (!developerToken) {
    throw new GoogleAdsApiError("Set GOOGLE_ADS_DEVELOPER_TOKEN", 503);
  }

  const apiVersion = process.env.GOOGLE_ADS_API_VERSION?.trim() || "v24";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": developerToken,
    "Content-Type": "application/json",
  };
  if (company.googleAdsLoginCustomerId) {
    headers["login-customer-id"] = normalizeCustomerId(company.googleAdsLoginCustomerId);
  }

  const res = await fetch(
    `https://googleads.googleapis.com/${apiVersion}/customers/${customerId}/googleAds:search`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        query: `
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
          LIMIT 500
        `,
      }),
    }
  );

  const body = (await res.json()) as {
    results?: Array<{
      localServicesLead?: {
        id?: string;
        leadType?: string;
        leadStatus?: string;
        creationDateTime?: string;
        leadCharged?: boolean;
        contactDetails?: { phoneNumber?: string };
      };
    }>;
    error?: { message?: string };
  };

  if (!res.ok) {
    throw new GoogleAdsApiError(
      body.error?.message ?? `Google Ads LSA lead query failed (${res.status})`,
      res.status
    );
  }

  return (body.results ?? []).map((row) => ({
    id: String(row.localServicesLead?.id ?? ""),
    phoneNumber: row.localServicesLead?.contactDetails?.phoneNumber ?? null,
    leadType: row.localServicesLead?.leadType ?? null,
    leadStatus: row.localServicesLead?.leadStatus ?? null,
    creationDateTime: row.localServicesLead?.creationDateTime ?? null,
    leadCharged: Boolean(row.localServicesLead?.leadCharged),
  }));
}
