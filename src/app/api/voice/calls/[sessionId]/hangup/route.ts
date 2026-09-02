import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/api-auth";
import { getOperatedCallSession } from "@/lib/voice/operated-session";
import { endCallSession } from "@/lib/voice/conference";

/** CSR hang up — ends the conference/customer leg (does not leave a warm transfer running). */
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

    const result = await endCallSession(found.session.companyId, sessionId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Hangup failed" },
      { status: 500 }
    );
  }
}
