import { NextRequest, NextResponse } from "next/server";
import { AgentPresenceStatus } from "@prisma/client";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { coldTransfer, warmTransfer } from "@/lib/voice/conference";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const user = await requireSessionUser();
    const { sessionId } = await params;
    const body = await request.json();
    const { targetUserId, type } = body as { targetUserId?: string; type?: "warm" | "cold" };

    if (!targetUserId || !type) {
      return NextResponse.json({ error: "targetUserId and type required" }, { status: 400 });
    }

    const targetPresence = await prisma.agentPresence.findFirst({
      where: {
        userId: targetUserId,
        companyId: user.companyId,
        status: AgentPresenceStatus.AVAILABLE,
      },
    });
    if (!targetPresence) {
      return NextResponse.json({ error: "Target agent not available" }, { status: 400 });
    }

    const session =
      type === "warm"
        ? await warmTransfer(user.companyId, sessionId, targetUserId)
        : await coldTransfer(user.companyId, sessionId, targetUserId);

    return NextResponse.json(session);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Transfer failed" },
      { status: 500 }
    );
  }
}
