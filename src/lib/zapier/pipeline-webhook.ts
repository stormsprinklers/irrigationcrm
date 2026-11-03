import type { PipelineConversionEvent, SalesPipelineStage } from "@prisma/client";
import {
  readResponseBufferLimited,
  safeOutboundFetch,
  validateOutboundUrlSyntax,
} from "@/lib/security/outbound-fetch";

const ZAPIER_WEBHOOK_HOSTS = ["hooks.zapier.com", "zapier.com"] as const;

type ZapierCustomer = {
  name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  userAgent: string | null;
};

type ZapierEvent = Pick<
  PipelineConversionEvent,
  "id" | "stage" | "value" | "gclid" | "gbraid" | "wbraid" | "userAgent"
>;

const STAGE_NAMES: Record<SalesPipelineStage, string> = {
  LEAD: "Lead",
  QUALIFIED: "Qualified",
  CONVERTED: "Converted",
  SOLD: "Sold",
  DISQUALIFIED: "Disqualified",
};

export function normalizeZapierWebhookUrl(value: string) {
  const url = validateOutboundUrlSyntax(value.trim(), { allowedHosts: ZAPIER_WEBHOOK_HOSTS });
  if (!url.pathname.startsWith("/hooks/catch/")) {
    throw new Error("Use the Catch Hook URL supplied by Zapier");
  }
  if (url.hash) throw new Error("Zapier webhook URL must not contain a fragment");
  return url.toString();
}

function splitName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return { firstName: "", lastName: "" };
  const space = trimmed.indexOf(" ");
  if (space < 0) return { firstName: trimmed, lastName: "" };
  return {
    firstName: trimmed.slice(0, space),
    lastName: trimmed.slice(space + 1).trim(),
  };
}

export function buildZapierPipelinePayload(params: {
  event: ZapierEvent;
  customer: ZapierCustomer;
}) {
  const { firstName, lastName } = splitName(params.customer.name);
  const amount = params.event.value == null ? "" : Number(params.event.value);
  return {
    "First Name": firstName,
    "Last Name": lastName,
    Email: params.customer.email?.trim() ?? "",
    Phone: params.customer.phone?.trim() ?? "",
    City: params.customer.city?.trim() ?? "",
    State: params.customer.state?.trim() ?? "",
    Zip: params.customer.zip?.trim() ?? "",
    gclid: params.event.gclid ?? params.customer.gclid ?? "",
    gbraid: params.event.gbraid ?? params.customer.gbraid ?? "",
    wbraid: params.event.wbraid ?? params.customer.wbraid ?? "",
    user_agent: params.event.userAgent ?? params.customer.userAgent ?? "",
    "Stage Name": STAGE_NAMES[params.event.stage],
    Amount: Number.isFinite(amount) ? amount : "",
  };
}

export async function sendZapierPipelineEvent(params: {
  webhookUrl: string;
  event: ZapierEvent;
  customer: ZapierCustomer;
}) {
  const webhookUrl = normalizeZapierWebhookUrl(params.webhookUrl);
  const response = await safeOutboundFetch(
    webhookUrl,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildZapierPipelinePayload(params)),
    },
    { allowedHosts: ZAPIER_WEBHOOK_HOSTS, maxRedirects: 2 }
  );
  const body = (await readResponseBufferLimited(response, 64 * 1024)).toString("utf8");
  if (!response.ok) {
    throw new Error(`Zapier webhook returned HTTP ${response.status}`);
  }

  let parsed: Record<string, unknown> = {};
  try {
    parsed = body ? (JSON.parse(body) as Record<string, unknown>) : {};
  } catch {
    // A successful non-JSON response is still a successful webhook delivery.
  }
  const requestId =
    [parsed.request_id, parsed.id, parsed.attempt].find((value) => typeof value === "string") ??
    response.headers.get("x-request-id") ??
    params.event.id;

  return {
    requestId: String(requestId),
    metadata: { status: response.status },
  };
}
