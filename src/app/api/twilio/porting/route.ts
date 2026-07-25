import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { getTwilioWebhookUrlCandidates } from "@/lib/inbox/twilio";
import { handlePortingWebhookPayload } from "@/lib/twilio/port-in-service";

function isValidJsonTwilioWebhook(request: NextRequest, rawBody: string) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) return true;

  const signature = request.headers.get("x-twilio-signature") ?? "";
  return getTwilioWebhookUrlCandidates(request).some((url) => {
    try {
      return twilio.validateRequestWithBody(authToken, signature, url, rawBody);
    } catch {
      // Older SDKs / form-style fallback: empty params
      return twilio.validateRequest(authToken, signature, url, {});
    }
  });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  if (process.env.TWILIO_AUTH_TOKEN && !isValidJsonTwilioWebhook(request, rawBody)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
  } catch {
    // Some Twilio products send form-encoded; accept both
    try {
      const params = new URLSearchParams(rawBody);
      body = Object.fromEntries(params.entries());
    } catch {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
  }

  const result = await handlePortingWebhookPayload({
    port_in_request_sid:
      typeof body.port_in_request_sid === "string"
        ? body.port_in_request_sid
        : undefined,
    port_in_phone_number_sid:
      body.port_in_phone_number_sid == null
        ? null
        : String(body.port_in_phone_number_sid),
    phone_number:
      body.phone_number == null ? null : String(body.phone_number),
    status: body.status == null ? null : String(body.status),
    portable:
      body.portable === true || body.portable === false
        ? body.portable
        : body.portable == null
          ? null
          : String(body.portable),
    not_portable_reason:
      body.not_portable_reason == null
        ? null
        : String(body.not_portable_reason),
    not_portable_reason_code:
      body.not_portable_reason_code == null
        ? null
        : (body.not_portable_reason_code as string | number),
    rejection_reason:
      body.rejection_reason == null ? null : String(body.rejection_reason),
    rejection_reason_code:
      body.rejection_reason_code == null
        ? null
        : (body.rejection_reason_code as string | number),
  });

  if (!result.ok && result.reason === "missing sid") {
    return NextResponse.json({ error: "Missing port_in_request_sid" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
