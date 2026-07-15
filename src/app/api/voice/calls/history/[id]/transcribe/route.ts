import { NextResponse } from "next/server";
import {
  requireSessionUser,
  unauthorizedResponse,
  forbiddenForFieldRole,
} from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { transcribeCallLogRecording } from "@/lib/voice/transcribe-recording";

/** POST — backfill / retry Whisper transcript for a call that has a recording. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireSessionUser();
    const fieldBlock = forbiddenForFieldRole(user.role);
    if (fieldBlock) return fieldBlock;

    const { id } = await params;
    const call = await prisma.callLog.findFirst({
      where: { id, companyId: user.companyId },
      select: { id: true },
    });
    if (!call) {
      return NextResponse.json({ error: "Call not found" }, { status: 404 });
    }

    const result = await transcribeCallLogRecording(call.id);
    if (!result.ok && result.skipped && result.skipped !== "Already transcribed") {
      const status =
        result.skipped.includes("OPENAI") || result.skipped.includes("Twilio")
          ? 503
          : 400;
      return NextResponse.json({ error: result.skipped }, { status });
    }

    return NextResponse.json({
      ok: true,
      transcript: result.transcript ?? null,
      skipped: result.skipped ?? null,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message = err instanceof Error ? err.message : "Transcription failed";
    const status = message.includes("OPENAI") || message.includes("Twilio") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
