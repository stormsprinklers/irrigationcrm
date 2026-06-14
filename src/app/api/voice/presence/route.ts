import { NextRequest, NextResponse } from "next/server";
import { AgentPresenceStatus } from "@prisma/client";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { normalizePhone } from "@/lib/inbox/contacts";
import { prisma } from "@/lib/prisma";
import { upsertPresence } from "@/lib/voice/presence";

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const body = await request.json();
    const status = body.status as AgentPresenceStatus;
    if (!status || !Object.values(AgentPresenceStatus).includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    const presence = await upsertPresence(user.companyId, user.id, status);
    return NextResponse.json(presence);
  } catch {
    return unauthorizedResponse();
  }
}

export async function GET() {
  try {
    const user = await requireSessionUser();
    const presence = await prisma.agentPresence.findUnique({ where: { userId: user.id } });
    return NextResponse.json(presence ?? { status: AgentPresenceStatus.OFFLINE });
  } catch {
    return unauthorizedResponse();
  }
}
