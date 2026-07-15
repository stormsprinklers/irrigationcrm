import { getOpenAIApiKey } from "@/lib/openai/client";
import { prisma } from "@/lib/prisma";
import { twilioRecordingMediaUrl } from "@/lib/voice/recording";

/**
 * Download a Twilio call recording and transcribe it with OpenAI Whisper.
 * Dial recordings cannot use Twilio's built-in <Record transcribe>; this covers those.
 */
export async function downloadTwilioRecordingAudio(recordingUrl: string): Promise<{
  bytes: ArrayBuffer;
  contentType: string;
  fileName: string;
}> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    throw new Error("Twilio is not configured");
  }

  const mediaUrl = twilioRecordingMediaUrl(recordingUrl);
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const res = await fetch(mediaUrl, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to download Twilio recording (${res.status})`);
  }

  const contentType = res.headers.get("content-type") ?? "audio/mpeg";
  const ext = contentType.includes("wav") ? "wav" : "mp3";
  return {
    bytes: await res.arrayBuffer(),
    contentType,
    fileName: `recording.${ext}`,
  };
}

export async function transcribeAudioWithWhisper(input: {
  bytes: ArrayBuffer;
  contentType: string;
  fileName: string;
}): Promise<string> {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(input.bytes)], { type: input.contentType }),
    input.fileName
  );
  form.append("model", "whisper-1");
  form.append("response_format", "text");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(err || `OpenAI Whisper failed (${res.status})`);
  }

  const text = (await res.text()).trim();
  if (!text) {
    throw new Error("Whisper returned an empty transcript");
  }
  return text;
}

export async function transcribeCallLogRecording(callLogId: string): Promise<{
  ok: boolean;
  transcript?: string;
  skipped?: string;
}> {
  const call = await prisma.callLog.findUnique({
    where: { id: callLogId },
    select: {
      id: true,
      recordingUrl: true,
      transcript: true,
      company: { select: { transcribeCalls: true } },
    },
  });

  if (!call) return { ok: false, skipped: "Call not found" };
  if (!call.company.transcribeCalls) {
    return { ok: false, skipped: "Transcription disabled for company" };
  }
  if (!call.recordingUrl) {
    return { ok: false, skipped: "No recording URL" };
  }
  if (call.transcript?.trim()) {
    return { ok: true, transcript: call.transcript, skipped: "Already transcribed" };
  }

  const audio = await downloadTwilioRecordingAudio(call.recordingUrl);
  const transcript = await transcribeAudioWithWhisper(audio);

  await prisma.callLog.update({
    where: { id: call.id },
    data: { transcript },
  });

  return { ok: true, transcript };
}

/** Match CallLog rows for a Twilio CallSid / ParentCallSid and transcribe if needed. */
export async function transcribeCallLogsForTwilioSids(input: {
  callSids: string[];
  recordingUrl: string;
}): Promise<void> {
  const sids = input.callSids.filter(Boolean);
  if (!sids.length || !input.recordingUrl) return;

  let logs = await prisma.callLog.findMany({
    where: { twilioCallSid: { in: sids } },
    select: {
      id: true,
      transcript: true,
      companyId: true,
      company: { select: { transcribeCalls: true } },
    },
  });

  if (!logs.length) {
    const session = await prisma.callSession.findFirst({
      where: { callSid: { in: sids } },
      select: { id: true },
    });
    if (session) {
      logs = await prisma.callLog.findMany({
        where: { sessionId: session.id },
        select: {
          id: true,
          transcript: true,
          companyId: true,
          company: { select: { transcribeCalls: true } },
        },
      });
    }
  }

  for (const log of logs) {
    if (!log.company.transcribeCalls) continue;
    if (log.transcript?.trim()) continue;
    try {
      await transcribeCallLogRecording(log.id);
    } catch (err) {
      console.error("Whisper transcription failed for call", log.id, err);
    }
  }
}
