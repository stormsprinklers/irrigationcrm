import { NextRequest, NextResponse } from "next/server";
import { AgentPresenceStatus } from "@prisma/client";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const agents = await prisma.agentPresence.findMany({
      where: {
        companyId: user.companyId,
        userId: { not: user.id },
        status: AgentPresenceStatus.AVAILABLE,
      },
      include: { user: { select: { id: true, name: true } } },
    });

    return NextResponse.json({
      agents: agents.map((a) => ({
        userId: a.userId,
        name: a.user.name,
        status: a.status,
      })),
    });
  } catch {
    return unauthorizedResponse();
  }
}
