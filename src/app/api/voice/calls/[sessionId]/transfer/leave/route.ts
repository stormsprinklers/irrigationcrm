import { NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { leaveCallAfterTransfer } from "@/lib/voice/conference";

/** CSR hangs up after warm/consult transfer — keep conference + recording for others. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const user = await requireSessionUser();
    const { sessionId } = await params;
    const session = await leaveCallAfterTransfer(user.companyId, sessionId);
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
