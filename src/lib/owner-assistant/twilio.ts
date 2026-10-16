import twilio from "twilio";
import { normalizePhone } from "@/lib/inbox/contacts";
import { getAppBaseUrl } from "@/lib/app-url";
import { prisma } from "@/lib/prisma";
import { createOwnerAssistantStreamToken, getOwnerAssistantWssUrl } from "./auth";
import { isOwnerAssistantAvailable } from "./availability";

export async function findOwnerAssistantByNumber(value: string) {
  const e164 = normalizePhone(value);
  return prisma.ownerAssistantConfig.findFirst({
    where: { phoneNumber: { e164 } },
    include: { phoneNumber: true, owner: { select: { id: true, name: true, email: true, companyId: true } } },
  });
}

export async function buildOwnerAssistantInboundVoice(params: Record<string, string>) {
  const config = await findOwnerAssistantByNumber(params.To || "");
  if (!config) return null;
  const response = new twilio.twiml.VoiceResponse();
  const from = normalizePhone(params.From || "");
  const to = normalizePhone(params.To || "");
  if (!config.enabled || !config.pinHash || !config.authorizedPhoneE164 || from !== normalizePhone(config.authorizedPhoneE164)) {
    response.say("This private number is not available.");
    response.hangup();
    return response.toString();
  }
  if (!isOwnerAssistantAvailable(config.availabilityJson)) {
    response.say(`${config.name} is outside its configured availability window.`);
    response.hangup();
    return response.toString();
  }
  const callSid = params.CallSid;
  if (!callSid) {
    response.hangup();
    return response.toString();
  }
  await prisma.ownerAssistantSession.upsert({
    where: { providerSid: callSid },
    create: { configId: config.id, companyId: config.homeCompanyId, providerSid: callSid, channel: "VOICE", status: "PIN_REQUIRED", fromE164: from, toE164: to },
    update: { status: "PIN_REQUIRED", failedPinAttempts: 0, endedAt: null },
  });
  const gather = response.gather({
    action: `${getAppBaseUrl()}/api/twilio/owner-assistant/voice/verify`,
    method: "POST",
    input: ["dtmf"],
    numDigits: 10,
    timeout: 8,
    finishOnKey: "#",
  });
  gather.say(`Welcome to ${config.name}. Enter your PIN, then press pound.`);
  response.say("No PIN was received.");
  response.hangup();
  return response.toString();
}

export function buildOwnerAssistantStreamTwiml(input: { configId: string; sessionId: string; callSid: string; name: string }) {
  const wss = getOwnerAssistantWssUrl();
  if (!wss || !/^wss:\/\//i.test(wss)) throw new Error("OWNER_ASSISTANT_PUBLIC_WSS_URL must be a secure WebSocket URL");
  const response = new twilio.twiml.VoiceResponse();
  response.say("PIN verified. Connecting your assistant.");
  const connect = response.connect({ action: `${getAppBaseUrl()}/api/twilio/owner-assistant/voice/status`, method: "POST" });
  const stream = connect.stream({ url: wss });
  stream.parameter({ name: "token", value: createOwnerAssistantStreamToken({ configId: input.configId, sessionId: input.sessionId, callSid: input.callSid }) });
  stream.parameter({ name: "sessionId", value: input.sessionId });
  stream.parameter({ name: "callSid", value: input.callSid });
  return response.toString();
}
