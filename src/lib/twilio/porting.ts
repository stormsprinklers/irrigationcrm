import { appBaseUrl } from "@/lib/voice/identity";

const NUMBERS_API = "https://numbers.twilio.com/v1";
const DOCUMENTS_UPLOAD_API = "https://numbers-upload.twilio.com/v1";

function twilioAuthHeader() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    throw new Error("Twilio credentials not configured");
  }
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
}

function accountSid() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  if (!sid) throw new Error("TWILIO_ACCOUNT_SID is not configured");
  return sid;
}

async function numbersFetch<T>(
  path: string,
  init?: RequestInit & { json?: unknown }
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: twilioAuthHeader(),
    ...(init?.headers as Record<string, string> | undefined),
  };
  let body = init?.body;
  if (init?.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.json);
  }
  const res = await fetch(`${NUMBERS_API}${path}`, {
    ...init,
    headers,
    body,
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }
  if (!res.ok) {
    const msg =
      data && typeof data === "object" && "message" in data
        ? String((data as { message: unknown }).message)
        : `Twilio Porting API error (${res.status})`;
    const err = new Error(msg) as Error & { status?: number; body?: unknown };
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data as T;
}

export type PortabilityResult = {
  phoneNumber: string;
  portable: boolean;
  pinAndAccountNumberRequired: boolean;
  numberType: string | null;
  country: string | null;
  notPortableReason: string | null;
  notPortableReasonCode: number | null;
};

export async function checkPortability(e164: string): Promise<PortabilityResult> {
  const encoded = encodeURIComponent(e164);
  const data = await numbersFetch<{
    phone_number?: string;
    portable?: boolean;
    pin_and_account_number_required?: boolean;
    number_type?: string | null;
    country?: string | null;
    not_portable_reason?: string | null;
    not_portable_reason_code?: number | null;
  }>(`/Porting/Portability/PhoneNumber/${encoded}`);

  return {
    phoneNumber: data.phone_number ?? e164,
    portable: Boolean(data.portable),
    pinAndAccountNumberRequired: Boolean(data.pin_and_account_number_required),
    numberType: data.number_type ?? null,
    country: data.country ?? null,
    notPortableReason: data.not_portable_reason ?? null,
    notPortableReasonCode: data.not_portable_reason_code ?? null,
  };
}

export type UploadedDocument = {
  sid: string;
  documentType: string;
  status: string;
  friendlyName: string | null;
};

export async function uploadUtilityBill(params: {
  file: Blob;
  filename: string;
  friendlyName?: string;
}): Promise<UploadedDocument> {
  const form = new FormData();
  form.append("document_type", "utility_bill");
  form.append("friendly_name", params.friendlyName ?? params.filename);
  form.append("File", params.file, params.filename);

  const res = await fetch(`${DOCUMENTS_UPLOAD_API}/Documents`, {
    method: "POST",
    headers: { Authorization: twilioAuthHeader() },
    body: form,
  });
  const data = (await res.json().catch(() => ({}))) as {
    sid?: string;
    document_type?: string;
    status?: string;
    friendly_name?: string | null;
    message?: string;
  };
  if (!res.ok || !data.sid) {
    throw new Error(data.message ?? `Failed to upload utility bill (${res.status})`);
  }
  return {
    sid: data.sid,
    documentType: data.document_type ?? "utility_bill",
    status: data.status ?? "DRAFT",
    friendlyName: data.friendly_name ?? null,
  };
}

export type LosingCarrierInformation = {
  customer_type: "Business" | "Individual";
  customer_name: string;
  account_number?: string | null;
  account_telephone_number: string;
  authorized_representative: string;
  authorized_representative_email: string;
  address?: {
    street: string;
    street_2?: string | null;
    city: string;
    state: string;
    zip: string;
    country: string;
  } | null;
  address_sid?: string | null;
};

export type CreatePortInParams = {
  phoneNumber: string;
  pin?: string | null;
  documentSid: string;
  losingCarrier: LosingCarrierInformation;
  notificationEmails: string[];
  targetPortInDate: string; // YYYY-MM-DD
  targetPortInTimeRangeStart?: string | null;
  targetPortInTimeRangeEnd?: string | null;
};

export type PortInPhoneNumber = {
  phone_number: string;
  portable?: boolean | null;
  rejection_reason?: string | null;
  rejection_reason_code?: string | number | null;
  port_in_phone_number_status?: string | null;
  port_in_phone_number_sid?: string | null;
  not_portability_reason?: string | null;
  not_portable_reason?: string | null;
  not_portable_reason_code?: string | number | null;
};

export type PortInRequest = {
  account_sid?: string;
  port_in_request_sid: string;
  port_in_request_status: string;
  target_port_in_date?: string | null;
  target_port_in_time_range_start?: string | null;
  target_port_in_time_range_end?: string | null;
  notification_emails?: string[];
  losing_carrier_information?: LosingCarrierInformation;
  phone_numbers?: PortInPhoneNumber[];
  documents?: string[];
  date_created?: string;
};

export async function createPortInRequest(params: CreatePortInParams): Promise<PortInRequest> {
  const payload: Record<string, unknown> = {
    account_sid: accountSid(),
    target_port_in_date: params.targetPortInDate,
    notification_emails: params.notificationEmails,
    losing_carrier_information: params.losingCarrier,
    phone_numbers: [
      {
        phone_number: params.phoneNumber,
        pin: params.pin || null,
      },
    ],
    documents: [params.documentSid],
  };
  if (params.targetPortInTimeRangeStart) {
    payload.target_port_in_time_range_start = params.targetPortInTimeRangeStart;
  }
  if (params.targetPortInTimeRangeEnd) {
    payload.target_port_in_time_range_end = params.targetPortInTimeRangeEnd;
  }

  return numbersFetch<PortInRequest>("/Porting/PortIn", {
    method: "POST",
    json: payload,
  });
}

export async function getPortInRequest(portInRequestSid: string): Promise<PortInRequest> {
  return numbersFetch<PortInRequest>(`/Porting/PortIn/${encodeURIComponent(portInRequestSid)}`);
}

export async function cancelPortInRequest(portInRequestSid: string): Promise<void> {
  await numbersFetch(`/Porting/PortIn/${encodeURIComponent(portInRequestSid)}`, {
    method: "DELETE",
  });
}

export async function cancelPortInPhoneNumber(
  portInRequestSid: string,
  phoneNumberSid: string
): Promise<void> {
  await numbersFetch(
    `/Porting/PortIn/${encodeURIComponent(portInRequestSid)}/PhoneNumber/${encodeURIComponent(phoneNumberSid)}`,
    { method: "DELETE" }
  );
}

/** Configure account-level port-in webhooks (idempotent overwrite). */
export async function ensurePortingWebhookConfigured() {
  const base = appBaseUrl().replace(/\/$/, "");
  if (!base) {
    throw new Error("App base URL is not configured — cannot register porting webhooks");
  }
  const portInUrl = `${base}/api/twilio/porting`;

  return numbersFetch("/Porting/Configuration/Webhook", {
    method: "POST",
    json: {
      port_in_target_url: portInUrl,
      notifications_of: [
        "PortInWaitingForSignature",
        "PortInInProgress",
        "PortInCompleted",
        "PortInActionRequired",
        "PortInCanceled",
        "PortInPhoneNumberWaitingForSignature",
        "PortInPhoneNumberSubmitted",
        "PortInPhoneNumberPending",
        "PortInPhoneNumberCompleted",
        "PortInPhoneNumberRejected",
        "PortInPhoneNumberCanceled",
      ],
    },
  });
}

export function isTollFreeNumberType(numberType: string | null | undefined) {
  if (!numberType) return false;
  return numberType.toUpperCase().includes("TOLL");
}

/** US NANP E.164 (+1 + 10 digits). */
export function isUsLocalE164(e164: string) {
  return /^\+1\d{10}$/.test(e164);
}

export function pinRequiredForPort(
  pinAndAccountNumberRequired: boolean,
  numberType: string | null | undefined
) {
  return (
    pinAndAccountNumberRequired ||
    (numberType ?? "").toUpperCase().includes("MOBILE")
  );
}

export function isAllowedUtilityBillUpload(params: {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  maxBytes?: number;
}) {
  const max = params.maxBytes ?? 10 * 1024 * 1024;
  if (params.sizeBytes <= 0 || params.sizeBytes > max) {
    return { ok: false as const, error: "File must be between 1 byte and 10MB" };
  }
  const mime = (params.mimeType || "").toLowerCase();
  const name = params.filename || "";
  const extOk = /\.(pdf|jpe?g|png)$/i.test(name);
  const mimeOk =
    mime === "application/pdf" ||
    mime === "image/jpeg" ||
    mime === "image/jpg" ||
    mime === "image/png";
  if (!extOk && !mimeOk) {
    return { ok: false as const, error: "Upload a PDF, JPG, or PNG utility bill" };
  }
  return { ok: true as const };
}

export function normalizePortStatus(status: string | null | undefined) {
  if (!status) return "Unknown";
  // Twilio mixes "In Review" and "in_review" / "waiting_for_signature"
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export function isTerminalPortStatus(status: string) {
  const s = status.toLowerCase().replace(/_/g, " ");
  return (
    s.includes("completed") ||
    s === "canceled" ||
    s === "cancelled" ||
    s.includes("canceled") ||
    s.includes("cancelled")
  );
}

export function pickPrimaryPhoneNumber(request: PortInRequest): PortInPhoneNumber | null {
  return request.phone_numbers?.[0] ?? null;
}
