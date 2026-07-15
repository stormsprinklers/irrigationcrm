import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateTwilioSignature } from "@/lib/inbox/twilio";
import { transcribeCallLogsForTwilioSids } from "@/lib/voice/transcribe-recording";

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
  const recordingUrl = params.RecordingUrl;
  const recordingStatus = (params.RecordingStatus ?? "").toLowerCase();

  // Ignore in-progress callbacks; only act when the recording is ready.
  if (recordingStatus && recordingStatus !== "completed") {
    return NextResponse.json({ ok: true, skipped: recordingStatus });
  }

  if (callSid && recordingUrl) {
    const sidCandidates = [callSid, parentCallSid].filter(Boolean) as string[];
    const updated = await prisma.callLog.updateMany({
      where: { twilioCallSid: { in: sidCandidates } },
      data: { recordingUrl },
    });

    if (updated.count === 0) {
      const session = await prisma.callSession.findFirst({
        where: { callSid: { in: sidCandidates } },
        select: { id: true },
      });
      if (session) {
        await prisma.callLog.updateMany({
          where: { sessionId: session.id },
          data: { recordingUrl },
        });
      }
    }

    // Dial recordings cannot use Twilio <Record transcribe>. Run Whisper after ACK
    // so the webhook stays under Twilio's timeout.
    after(async () => {
      try {
        await transcribeCallLogsForTwilioSids({
          callSids: sidCandidates,
          recordingUrl,
        });
      } catch (err) {
        console.error("Post-recording transcription failed", err);
      }
    });
  }

  return NextResponse.json({ ok: true });
}
