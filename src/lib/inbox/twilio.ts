import twilio from "twilio";
import type { NextRequest } from "next/server";
import { getAppBaseUrl } from "@/lib/app-url";

function firstHeaderValue(value: string | null) {
  if (!value) return null;
  return value.split(",")[0]?.trim() || null;
}

export function getTwilioWebhookUrl(request: NextRequest) {
  const forwardedProto = firstHeaderValue(request.headers.get("x-forwarded-proto"));
  const forwardedHost = firstHeaderValue(request.headers.get("x-forwarded-host"));
  const host =
    forwardedHost ?? request.headers.get("host") ?? request.nextUrl.host;
  const proto =
    forwardedProto ??
    (request.nextUrl.protocol ? request.nextUrl.protocol.replace(":", "") : "https");
  return `${proto}://${host}${request.nextUrl.pathname}${request.nextUrl.search}`;
}

/** Twilio signs the exact public URL; try common proxy / env variants. */
export function getTwilioWebhookUrlCandidates(request: NextRequest) {
  const path = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  const candidates = new Set<string>();

  candidates.add(getTwilioWebhookUrl(request));
  candidates.add(request.url);

  const configuredBase = getAppBaseUrl();
  if (configuredBase) {
    candidates.add(`${configuredBase}${path}`);
  }

  const host = firstHeaderValue(request.headers.get("x-forwarded-host")) ?? request.headers.get("host");
  if (host) {
    candidates.add(`https://${host}${path}`);
    candidates.add(`http://${host}${path}`);
  }

  return [...candidates].filter(Boolean);
}

export function isValidTwilioWebhookRequest(
  request: NextRequest,
  params: Record<string, string>
) {
  const signature = request.headers.get("x-twilio-signature") ?? "";
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) return true;

  return getTwilioWebhookUrlCandidates(request).some((url) =>
    twilio.validateRequest(authToken, signature, url, params)
  );
}

export function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    throw new Error("Twilio credentials not configured");
  }
  return twilio(accountSid, authToken);
}

export function validateTwilioSignature(
  signature: string,
  url: string,
  params: Record<string, string>
) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) return false;
  return twilio.validateRequest(authToken, signature, url, params);
}

export function getTwilioVoiceToken(identity: string) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const apiKey = process.env.TWILIO_API_KEY;
  const apiSecret = process.env.TWILIO_API_SECRET;
  const twimlAppSid = process.env.TWILIO_TWIML_APP_SID;

  if (!accountSid || !apiKey || !apiSecret || !twimlAppSid) {
    throw new Error("Twilio Voice SDK credentials not configured");
  }

  const AccessToken = twilio.jwt.AccessToken;
  const VoiceGrant = AccessToken.VoiceGrant;

  const token = new AccessToken(accountSid, apiKey, apiSecret, {
    identity,
    ttl: 3600,
  });

  token.addGrant(
    new VoiceGrant({
      outgoingApplicationSid: twimlAppSid,
      incomingAllow: true,
    })
  );

  return token.toJwt();
}

export async function sendSms(params: {
  from: string;
  to: string;
  body: string;
  statusCallback?: string;
}) {
  const client = getTwilioClient();
  return client.messages.create({
    from: params.from,
    to: params.to,
    body: params.body,
    statusCallback: params.statusCallback,
  });
}

export async function initiateOutboundCall(params: {
  from: string;
  to: string;
  url: string;
  statusCallback: string;
  record?: boolean;
}) {
  const client = getTwilioClient();
  return client.calls.create({
    from: params.from,
    to: params.to,
    url: params.url,
    statusCallback: params.statusCallback,
    statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
    record: params.record ?? true,
    recordingStatusCallback: `${process.env.NEXT_PUBLIC_APP_URL}/api/twilio/voice/recording`,
  });
}
