import { NextRequest, NextResponse, after } from "next/server";
import { extractBearer, verifyToolBearer } from "@/lib/ai-receptionist/auth";
import { ensureReceptionistCallLog } from "@/lib/ai-receptionist/call-log";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const bodySchema = z.object({
  transcriptAppend: z.string().optional(),
  summary: z.string().optional(),
  status: z.enum(["ACTIVE", "COMPLETED", "FAILED", "TRANSFERRED", "VOICEMAIL"]).optional(),
  failureReason: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const bearer = extractBearer(request.headers.get("authorization"));
    if (!bearer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const claims = verifyToolBearer(bearer);
    if (!claims) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const call = await prisma.receptionistCall.findFirst({
      where: {
        id: claims.receptionistCallId,
        companyId: claims.companyId,
        callSid: claims.callSid,
      },
    });
    if (!call) return NextResponse.json({ error: "Not found" }, { status: 404 });

    let callLogId = call.callLogId;
    if (!callLogId) {
      const log = await ensureReceptionistCallLog({
        companyId: call.companyId,
        callSid: call.callSid,
        fromE164: call.fromE164,
        toE164: call.toE164,
        customerId: call.customerId,
        callSessionId: call.callSessionId,
        receptionistCallId: call.id,
      });
      callLogId = log.id;
    }

    const data: {
      transcript?: string;
      summary?: string;
      status?: "ACTIVE" | "COMPLETED" | "FAILED" | "TRANSFERRED" | "VOICEMAIL";
      failureReason?: string;
      endedAt?: Date;
      callLogId?: string;
    } = {};

    if (!call.callLogId && callLogId) data.callLogId = callLogId;

    if (parsed.data.transcriptAppend) {
      data.transcript = `${call.transcript}${parsed.data.transcriptAppend}`;
    }
    if (parsed.data.summary) data.summary = parsed.data.summary;
    if (parsed.data.status) {
      data.status = parsed.data.status;
      if (parsed.data.status !== "ACTIVE") data.endedAt = new Date();
    }
    if (parsed.data.failureReason) data.failureReason = parsed.data.failureReason;

    const updated = await prisma.receptionistCall.update({
      where: { id: call.id },
      data,
    });

    const nextTranscript = data.transcript ?? call.transcript;
    if (callLogId && (parsed.data.transcriptAppend || parsed.data.summary || parsed.data.status)) {
      await prisma.callLog.update({
        where: { id: callLogId },
        data: {
          ...(parsed.data.transcriptAppend || parsed.data.summary
            ? { transcript: nextTranscript }
            : {}),
          ...(parsed.data.summary ? { aiSummary: parsed.data.summary } : {}),
          ...(parsed.data.status && parsed.data.status !== "ACTIVE"
            ? {
                status: parsed.data.status.toLowerCase(),
                endedAt: new Date(),
              }
            : {}),
          ...(call.customerId
            ? { customerId: call.customerId }
            : {}),
        },
      });
    }

    // When the AI call ends, summarize from the live transcript if we have one.
    if (
      callLogId &&
      parsed.data.status &&
      parsed.data.status !== "ACTIVE" &&
      nextTranscript.trim()
    ) {
      after(async () => {
        try {
          const { summarizeCallLog } = await import("@/lib/voice/summarize-call");
          await summarizeCallLog(callLogId!);
        } catch (err) {
          console.error("AI receptionist call summary failed", callLogId, err);
        }
      });
    }

    return NextResponse.json({ ok: true, id: updated.id });
  } catch (err) {
    console.error("AI receptionist transcript error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
