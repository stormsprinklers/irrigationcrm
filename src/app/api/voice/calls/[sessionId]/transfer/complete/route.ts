import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/api-auth";
import { getOperatedCallSession } from "@/lib/voice/operated-session";
import { completeWarmTransfer } from "@/lib/voice/conference";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const user = await requireSessionUser();
    const { sessionId } = await params;
    const found = await getOperatedCallSession(user, sessionId);
    if (!found) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    const session = await completeWarmTransfer(found.session.companyId, sessionId);
    return NextResponse.json(session);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Complete transfer failed" },
      { status: 500 }
    );
  }
}
