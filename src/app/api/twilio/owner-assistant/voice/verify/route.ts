import { compare } from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { isValidTwilioWebhookRequest } from "@/lib/inbox/twilio";
import { normalizePhone } from "@/lib/inbox/contacts";
import { buildOwnerAssistantStreamTwiml } from "@/lib/owner-assistant/twilio";
import { prisma } from "@/lib/prisma";
import { consumeSecurityRateLimit } from "@/lib/security/rate-limit";
import { twimlSayAndHangup } from "@/lib/voice/twiml-response";
import { getAppBaseUrl } from "@/lib/app-url";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const params: Record<string, string> = {};
  form.forEach((value, key) => { params[key] = String(value); });
  if (!process.env.TWILIO_AUTH_TOKEN || !isValidTwilioWebhookRequest(request, params)) return twimlSayAndHangup("Unable to verify this call.");
  const callSid = params.CallSid || "";
  const session = await prisma.ownerAssistantSession.findUnique({ where: { providerSid: callSid }, include: { config: true } });
  if (!session || normalizePhone(params.From || "") !== normalizePhone(session.config.authorizedPhoneE164 || "")) return twimlSayAndHangup("Unable to verify this call.");
  const rate = await consumeSecurityRateLimit("owner-assistant-pin", session.configId, 5, { windowMs: 15 * 60_000, blockMs: 30 * 60_000 }).catch(() => ({ allowed: false, retryAfterSeconds: 60 }));
  if (!rate.allowed) return twimlSayAndHangup("Too many attempts. Try again later.");
  const ok = Boolean(session.config.pinHash) && await compare(String(params.Digits || ""), session.config.pinHash!);
  if (!ok) {
    const updated = await prisma.ownerAssistantSession.update({ where: { id: session.id }, data: { failedPinAttempts: { increment: 1 }, status: "PIN_FAILED" } });
    if (updated.failedPinAttempts >= 3) return twimlSayAndHangup("Too many incorrect attempts.");
    const response = new (await import("twilio")).default.twiml.VoiceResponse();
    const gather = response.gather({ action: `${getAppBaseUrl()}/api/twilio/owner-assistant/voice/verify`, method: "POST", input: ["dtmf"], numDigits: 10, timeout: 8, finishOnKey: "#" });
    gather.say("That PIN was incorrect. Try again, then press pound.");
    response.hangup();
    return new NextResponse(response.toString(), { headers: { "Content-Type": "text/xml" } });
  }
  const verified = await prisma.ownerAssistantSession.update({ where: { id: session.id }, data: { pinVerifiedAt: new Date(), status: "ACTIVE", failedPinAttempts: 0 } });
  const xml = buildOwnerAssistantStreamTwiml({ configId: session.configId, sessionId: verified.id, callSid, name: session.config.name });
  return new NextResponse(xml, { headers: { "Content-Type": "text/xml" } });
}
