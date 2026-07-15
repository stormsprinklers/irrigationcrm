import { NextResponse } from "next/server";
import {
  requireSessionUser,
  unauthorizedResponse,
  forbiddenForFieldRole,
} from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { summarizeCallLog } from "@/lib/voice/summarize-call";

/** POST — generate or refresh AI call summary from transcript. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireSessionUser();
    const fieldBlock = forbiddenForFieldRole(user.role);
    if (fieldBlock) return fieldBlock;

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { force?: boolean };

    const call = await prisma.callLog.findFirst({
      where: { id, companyId: user.companyId },
      select: { id: true },
    });
    if (!call) {
      return NextResponse.json({ error: "Call not found" }, { status: 404 });
    }

    const result = await summarizeCallLog(call.id, { force: Boolean(body.force) });
    if (!result.ok && result.skipped && result.skipped !== "Already summarized") {
      const status = result.skipped.includes("OPENAI") ? 503 : 400;
      return NextResponse.json({ error: result.skipped }, { status });
    }

    return NextResponse.json({
      ok: true,
      summary: result.summary ?? null,
      skipped: result.skipped ?? null,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message = err instanceof Error ? err.message : "Summary failed";
    const status = message.includes("OPENAI") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
