import type { PipelineConversionPayloadInput } from "@/lib/meta/conversions-api";
import { getGoogleAdsAccessToken } from "@/lib/google-ads/client";
import { prisma } from "@/lib/prisma";

const DATA_MANAGER_INGEST_URL = "https://datamanager.googleapis.com/v1/events:ingest";

const ACTION_FIELD = {
  LEAD: "googleAdsPipelineLeadActionId",
  QUALIFIED: "googleAdsPipelineQualifiedActionId",
  CONVERTED: "googleAdsPipelineConvertedActionId",
  SOLD: "googleAdsPipelineSoldActionId",
} as const;

function numericValue(value: PipelineConversionPayloadInput["value"]) {
  if (value == null) return null;
  const number = typeof value === "number" ? value : value.toNumber();
  return Number.isFinite(number) ? number : null;
}

export function buildGoogleDataManagerEvent(input: PipelineConversionPayloadInput & {
  eventSource?: string;
}) {
  const userIdentifiers: Array<Record<string, string>> = [];
  if (input.emailSha256) userIdentifiers.push({ emailAddress: input.emailSha256 });
  if (input.phoneSha256) userIdentifiers.push({ phoneNumber: input.phoneSha256 });

  const adIdentifiers: Record<string, unknown> = {};
  if (input.gclid) adIdentifiers.gclid = input.gclid;
  if (input.gbraid) adIdentifiers.gbraid = input.gbraid;
  if (input.wbraid) adIdentifiers.wbraid = input.wbraid;
  if (input.userAgent) {
    adIdentifiers.landingPageDeviceInfo = { userAgent: input.userAgent };
  }

  if (!userIdentifiers.length && !input.gclid && !input.gbraid && !input.wbraid) {
    throw new Error("No Google click ID, email, or phone identifier is available");
  }

  const value = numericValue(input.value);
  return {
    eventTimestamp: input.occurredAt.toISOString(),
    transactionId: `crm-pipeline-${input.id}`,
    eventSource: input.eventSource || "WEB",
    ...(Object.keys(adIdentifiers).length ? { adIdentifiers } : {}),
    ...(userIdentifiers.length ? { userData: { userIdentifiers } } : {}),
    ...(value != null ? { conversionValue: value, currency: input.currency || "USD" } : {}),
  };
}

export async function sendGooglePipelineEvent(params: {
  companyId: string;
  event: PipelineConversionPayloadInput & { eventSource?: string };
}) {
  const company = await prisma.company.findUnique({
    where: { id: params.companyId },
    select: {
      googleAdsCustomerId: true,
      googleAdsLoginCustomerId: true,
      googleAdsPipelineLeadActionId: true,
      googleAdsPipelineQualifiedActionId: true,
      googleAdsPipelineConvertedActionId: true,
      googleAdsPipelineSoldActionId: true,
    },
  });
  if (!company?.googleAdsCustomerId) throw new Error("Google Ads account is not linked");
  const field = ACTION_FIELD[params.event.stage as keyof typeof ACTION_FIELD];
  if (!field) throw new Error(`Unsupported Google pipeline stage: ${params.event.stage}`);
  const actionId = company[field];
  if (!actionId) throw new Error(`Google conversion action is not configured for ${params.event.stage}`);

  const accessToken = await getGoogleAdsAccessToken(params.companyId);
  const accountId = company.googleAdsCustomerId.replace(/\D/g, "");
  const loginAccountId = (company.googleAdsLoginCustomerId || company.googleAdsCustomerId).replace(
    /\D/g,
    ""
  );
  const response = await fetch(DATA_MANAGER_INGEST_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      destinations: [
        {
          operatingAccount: { accountType: "GOOGLE_ADS", accountId },
          loginAccount: { accountType: "GOOGLE_ADS", accountId: loginAccountId },
          productDestinationId: actionId,
        },
      ],
      events: [buildGoogleDataManagerEvent(params.event)],
      encoding: "HEX",
      // Do not infer consent. Add adUserData/adPersonalization only after a
      // source-specific consent signal is captured and persisted on the lead.
    }),
    cache: "no-store",
  });
  const result = (await response.json().catch(() => ({}))) as {
    requestId?: string;
    fieldWarnings?: unknown[];
    error?: { message?: string; status?: string; code?: number };
  };
  if (!response.ok || result.error || !result.requestId) {
    const error = new Error(result.error?.message || `Google returned HTTP ${response.status}`) as Error & {
      status?: number;
      transient?: boolean;
    };
    error.status = response.status;
    error.transient = response.status === 429 || response.status >= 500;
    throw error;
  }
  return {
    requestId: result.requestId,
    metadata: { fieldWarnings: result.fieldWarnings ?? [] },
  };
}
