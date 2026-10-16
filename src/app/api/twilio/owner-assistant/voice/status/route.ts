import { NextRequest, NextResponse } from "next/server";
import { isValidTwilioWebhookRequest } from "@/lib/inbox/twilio";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const params: Record<string, string> = {};
  form.forEach((value, key) => { params[key] = String(value); });
  if (!process.env.TWILIO_AUTH_TOKEN || !isValidTwilioWebhookRequest(request, params)) return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  if (params.CallSid) await prisma.ownerAssistantSession.updateMany({ where: { providerSid: params.CallSid }, data: { status: "COMPLETED", endedAt: new Date() } });
  return new NextResponse("<Response><Hangup/></Response>", { headers: { "Content-Type": "text/xml" } });
}
