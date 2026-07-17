import { NextRequest, NextResponse } from "next/server";
import { AgentPresenceStatus } from "@prisma/client";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
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

    if (mode === "external_number") {
      if (!phone?.trim()) {
        return NextResponse.json({ error: "phone is required" }, { status: 400 });
      }
      const session = await externalPhoneTransfer(
        user.companyId,
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
        user.companyId,
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
