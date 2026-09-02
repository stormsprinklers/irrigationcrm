import { NextRequest, NextResponse } from "next/server";
import { AgentPresenceStatus } from "@prisma/client";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { getOperatedCallSession } from "@/lib/voice/operated-session";
import {
  coldTransfer,
  externalPhoneTransfer,
  warmTransfer,
} from "@/lib/voice/conference";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const user = await requireSessionUser();
    const { sessionId } = await params;
    const body = await request.json();
    const { targetUserId, type, mode, phone, displayName } = body as {
      targetUserId?: string;
      type?: "warm" | "cold";
      mode?: "agent" | "employee_phone" | "external_number";
      phone?: string;
      displayName?: string;
    };

    if (!type) {
      return NextResponse.json({ error: "type required" }, { status: 400 });
    }

    const found = await getOperatedCallSession(user, sessionId);
    if (!found) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    const companyId = found.session.companyId;

    if (mode === "external_number") {
      if (!phone?.trim()) {
        return NextResponse.json({ error: "phone is required" }, { status: 400 });
      }
      const session = await externalPhoneTransfer(
        companyId,
        sessionId,
        { phone: phone.trim(), displayName },
        type
      );
      return NextResponse.json(session);
    }

    if (mode === "employee_phone") {
      if (!targetUserId) {
        return NextResponse.json({ error: "targetUserId required" }, { status: 400 });
      }
      const session = await externalPhoneTransfer(
        companyId,
        sessionId,
        { userId: targetUserId },
        type
      );
      return NextResponse.json(session);
    }

    if (!targetUserId) {
      return NextResponse.json({ error: "targetUserId and type required" }, { status: 400 });
    }

    const targetPresence = await prisma.agentPresence.findFirst({
      where: {
        userId: targetUserId,
        companyId,
        status: AgentPresenceStatus.AVAILABLE,
      },
    });
    if (!targetPresence) {
      return NextResponse.json({ error: "Target agent not available" }, { status: 400 });
    }

    const session =
      type === "warm"
        ? await warmTransfer(companyId, sessionId, targetUserId)
        : await coldTransfer(companyId, sessionId, targetUserId);

    return NextResponse.json(session);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Transfer failed" },
      { status: 500 }
    );
  }
}
