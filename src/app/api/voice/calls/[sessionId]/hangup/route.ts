import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { endCallSession } from "@/lib/voice/conference";

/** CSR hang up — ends the conference/customer leg (does not leave a warm transfer running). */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const user = await requireSessionUser();
    const { sessionId } = await params;

    const session = await prisma.callSession.findFirst({
      where: { id: sessionId, companyId: user.companyId },
    });
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const result = await endCallSession(user.companyId, sessionId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Hangup failed" },
      { status: 500 }
    );
  }
}
