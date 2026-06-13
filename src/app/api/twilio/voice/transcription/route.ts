import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateTwilioSignature } from "@/lib/inbox/twilio";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const params: Record<string, string> = {};
  formData.forEach((value, key) => {
    params[key] = String(value);
  });

  const signature = request.headers.get("x-twilio-signature") ?? "";
  if (
    process.env.TWILIO_AUTH_TOKEN &&
    !validateTwilioSignature(signature, request.url, params)
  ) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  const callSid = params.CallSid;
  const transcriptionText = params.TranscriptionText;

  if (callSid && transcriptionText) {
    await prisma.callLog.updateMany({
      where: { twilioCallSid: callSid },
      data: { transcript: transcriptionText },
    });
  }

  return NextResponse.json({ ok: true });
}
