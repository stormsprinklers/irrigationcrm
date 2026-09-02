import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/api-auth";
import { getOperatedCallSession } from "@/lib/voice/operated-session";
import { toggleHold } from "@/lib/voice/conference";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const user = await requireSessionUser();
    const { sessionId } = await params;
    const body = await request.json();
    const hold = Boolean(body.hold);

    const found = await getOperatedCallSession(user, sessionId);
    if (!found) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const result = await toggleHold(sessionId, hold);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Hold failed" },
      { status: 500 }
    );
  }
}
