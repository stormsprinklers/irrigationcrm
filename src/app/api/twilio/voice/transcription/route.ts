import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateTwilioSignature } from "@/lib/inbox/twilio";
import { summarizeCallLogsForTranscriptUpdate } from "@/lib/voice/summarize-call";

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
  const parentCallSid = params.ParentCallSid;
  const transcriptionText = params.TranscriptionText;

  if (callSid && transcriptionText) {
    const sidCandidates = [callSid, parentCallSid].filter(Boolean) as string[];
    const logs = await prisma.callLog.findMany({
      where: { twilioCallSid: { in: sidCandidates } },
      select: { id: true },
    });

    let ids = logs.map((l) => l.id);

    if (!ids.length) {
      const session = await prisma.callSession.findFirst({
        where: { callSid: { in: sidCandidates } },
        select: { id: true },
      });
      if (session) {
        const sessionLogs = await prisma.callLog.findMany({
          where: { sessionId: session.id },
          select: { id: true },
        });
        ids = sessionLogs.map((l) => l.id);
      }
    }

    if (ids.length) {
      await prisma.callLog.updateMany({
        where: { id: { in: ids } },
        data: { transcript: transcriptionText },
      });
      void summarizeCallLogsForTranscriptUpdate(ids);
    }
  }

  return NextResponse.json({ ok: true });
}
