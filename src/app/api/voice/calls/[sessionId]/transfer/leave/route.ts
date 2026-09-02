import { NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getOperatedCallSession } from "@/lib/voice/operated-session";
import { leaveCallAfterTransfer } from "@/lib/voice/conference";

/** CSR hangs up after warm/consult transfer — keep conference + recording for others. */
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
    const session = await leaveCallAfterTransfer(found.session.companyId, sessionId);
    return NextResponse.json({ ok: true, sessionId: session.id });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Leave failed" },
      { status: 500 }
    );
  }
}
