import { createHash } from "crypto";
import type { SalesPipelineStage } from "@prisma/client";
import { hashPipelineExternalId } from "@/lib/marketing/pipeline-conversion-identifiers";

const DEFAULT_DATASET_ID = "28571679552473353";
const DEFAULT_API_VERSION = "v26.0";

type MetaEventMetadata = {
  eventId?: string;
  fbp?: string;
  fbc?: string;
  eventSourceUrl?: string;
  postalCode?: string;
  clientIpAddress?: string;
  clientUserAgent?: string;
};

type MetaCrmLeadInput = {
  leadId: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  metadata?: Record<string, unknown> | null;
  eventTime?: Date;
};

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z]/g, "");
}

function normalizeCity(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z]/g, "");
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 ? `1${digits}` : digits;
}

function metaEventMetadata(metadata: Record<string, unknown> | null | undefined): MetaEventMetadata {
  const raw = metadata?.metaEvent;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const record = raw as Record<string, unknown>;
  return {
    eventId: text(record.eventId),
    fbp: text(record.fbp),
    fbc: text(record.fbc),
    eventSourceUrl: text(record.eventSourceUrl),
    postalCode: text(record.postalCode),
    clientIpAddress: text(record.clientIpAddress),
    clientUserAgent: text(record.clientUserAgent),
  };
}

export function buildMetaCrmLeadEvent(input: MetaCrmLeadInput) {
  const meta = metaEventMetadata(input.metadata);
  const nameParts = input.name.trim().split(/\s+/).filter(Boolean);
  const firstName = nameParts[0];
  const lastName = nameParts.slice(1).join(" ");
  const userData: Record<string, string[]> = {
    external_id: [sha256(input.leadId)],
  };

  if (input.email) userData.em = [sha256(normalizeEmail(input.email))];
  if (input.phone) userData.ph = [sha256(normalizePhone(input.phone))];
  if (firstName) userData.fn = [sha256(normalizeName(firstName))];
  if (lastName) userData.ln = [sha256(normalizeName(lastName))];
  if (input.city) userData.ct = [sha256(normalizeCity(input.city))];
  userData.st = [sha256("ut")];
  if (meta.postalCode) userData.zp = [sha256(meta.postalCode.replace(/\D/g, ""))];

  const unhashedUserData: Record<string, string> = {};
  if (meta.fbp) unhashedUserData.fbp = meta.fbp;
  if (meta.fbc) unhashedUserData.fbc = meta.fbc;
  if (meta.clientIpAddress) unhashedUserData.client_ip_address = meta.clientIpAddress;
  if (meta.clientUserAgent) unhashedUserData.client_user_agent = meta.clientUserAgent;

  return {
    event_name: "Lead",
    event_time: Math.floor((input.eventTime ?? new Date()).getTime() / 1000),
    event_id: meta.eventId ?? `crm-lead-${input.leadId}`,
    action_source: "system_generated",
    ...(meta.eventSourceUrl ? { event_source_url: meta.eventSourceUrl } : {}),
    user_data: {
      ...userData,
      ...unhashedUserData,
    },
    custom_data: {
      event_source: "crm",
      lead_event_source: "Storm Sprinklers CRM",
    },
  };
}

export async function sendMetaCrmLeadEvent(input: MetaCrmLeadInput) {
  const accessToken = process.env.META_CONVERSIONS_ACCESS_TOKEN?.trim();
  if (!accessToken) {
    return { ok: false as const, skipped: true as const, error: "Meta access token is not configured" };
  }

  const datasetId = process.env.META_CONVERSIONS_DATASET_ID?.trim() || DEFAULT_DATASET_ID;
  const apiVersion = process.env.META_CONVERSIONS_API_VERSION?.trim() || DEFAULT_API_VERSION;
  const testEventCode = process.env.META_CONVERSIONS_TEST_EVENT_CODE?.trim();
  const endpoint = `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(datasetId)}/events`;
  const payload = {
    data: [buildMetaCrmLeadEvent(input)],
    ...(testEventCode ? { test_event_code: testEventCode } : {}),
  };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const result = (await response.json().catch(() => ({}))) as {
      events_received?: number;
      fbtrace_id?: string;
      error?: { message?: string; code?: number };
    };

    if (!response.ok || result.error || result.events_received !== 1) {
      const error = result.error?.message || `Meta returned HTTP ${response.status}`;
      return { ok: false as const, error, code: result.error?.code };
    }

    return { ok: true as const, eventsReceived: result.events_received, traceId: result.fbtrace_id };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Meta request failed",
    };
  }
}

export type PipelineConversionPayloadInput = {
  id: string;
  customerId: string;
  stage: SalesPipelineStage;
  occurredAt: Date;
  value: { toNumber(): number } | number | null;
  currency: string;
  emailSha256: string | null;
  phoneSha256: string | null;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  fbc: string | null;
  fbp: string | null;
  userAgent: string | null;
};

const META_PIPELINE_EVENT_NAMES: Partial<Record<SalesPipelineStage, string>> = {
  LEAD: "Lead",
  QUALIFIED: "QualifiedLead",
  CONVERTED: "ConvertedLead",
  SOLD: "Purchase",
};

function numericValue(value: PipelineConversionPayloadInput["value"]) {
  if (value == null) return null;
  const number = typeof value === "number" ? value : value.toNumber();
  return Number.isFinite(number) ? number : null;
}

export function buildMetaPipelineEvent(input: PipelineConversionPayloadInput) {
  const eventName = META_PIPELINE_EVENT_NAMES[input.stage];
  if (!eventName) throw new Error(`Unsupported Meta pipeline stage: ${input.stage}`);

  const userData: Record<string, string | string[]> = {
    external_id: [hashPipelineExternalId(input.customerId)],
  };
  if (input.emailSha256) userData.em = [input.emailSha256];
  if (input.phoneSha256) userData.ph = [input.phoneSha256];
  if (input.fbc) userData.fbc = input.fbc;
  if (input.fbp) userData.fbp = input.fbp;
  if (input.userAgent) userData.client_user_agent = input.userAgent;

  const value = numericValue(input.value);
  return {
    event_name: eventName,
    event_time: Math.floor(input.occurredAt.getTime() / 1000),
    event_id: `crm-pipeline-${input.id}`,
    action_source: "system_generated",
    user_data: userData,
    custom_data: {
      pipeline_stage: input.stage,
      event_source: "crm",
      ...(value != null ? { value, currency: input.currency || "USD" } : {}),
    },
  };
}

export async function sendMetaPipelineEvent(params: {
  event: PipelineConversionPayloadInput;
  accessToken: string;
  datasetId: string;
  testEventCode?: string | null;
}) {
  const apiVersion = process.env.META_CONVERSIONS_API_VERSION?.trim() || DEFAULT_API_VERSION;
  const endpoint = `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(params.datasetId)}/events`;
  const payload = {
    data: [buildMetaPipelineEvent(params.event)],
    ...(params.testEventCode?.trim() ? { test_event_code: params.testEventCode.trim() } : {}),
  };
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const result = (await response.json().catch(() => ({}))) as {
    events_received?: number;
    fbtrace_id?: string;
    messages?: string[];
    error?: { message?: string; code?: number; error_subcode?: number; is_transient?: boolean };
  };
  if (!response.ok || result.error || result.events_received !== 1) {
    const error = new Error(result.error?.message || `Meta returned HTTP ${response.status}`) as Error & {
      status?: number;
      transient?: boolean;
    };
    error.status = response.status;
    error.transient = Boolean(result.error?.is_transient) || response.status === 429 || response.status >= 500;
    throw error;
  }
  return {
    requestId: result.fbtrace_id ?? null,
    metadata: {
      eventsReceived: result.events_received,
      messages: result.messages ?? [],
      datasetId: params.datasetId,
      eventName: META_PIPELINE_EVENT_NAMES[params.event.stage] ?? params.event.stage,
      eventId: `crm-pipeline-${params.event.id}`,
      actionSource: "system_generated",
      testMode: Boolean(params.testEventCode?.trim()),
      testEventCode: params.testEventCode?.trim() || null,
    },
  };
}
