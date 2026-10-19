import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/api-auth";
import { requireRealAdmin } from "@/lib/owner-assistant/access";
import { verifyOwnerAssistantStepUpToken } from "@/lib/owner-assistant/step-up";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const session = await requireSessionUser(request);
    const owner = await requireRealAdmin(session);
    const verified = await verifyOwnerAssistantStepUpToken(
      request.headers.get("x-owner-assistant-mfa") || "",
      { userId: owner.id, companyId: owner.companyId }
    );
    if (!verified.ok) {
      return NextResponse.json({ error: verified.error }, { status: 401 });
    }

    const config = await prisma.ownerAssistantConfig.findUnique({
      where: { ownerUserId: owner.id },
      select: { id: true },
    });
    if (!config) return NextResponse.json({ sessions: [], messages: [], actions: [] });

    const [sessions, messages, actions] = await Promise.all([
      prisma.ownerAssistantSession.findMany({
        where: { configId: config.id },
        orderBy: { startedAt: "desc" },
        take: 40,
        select: {
          id: true,
          channel: true,
          status: true,
          fromE164: true,
          toE164: true,
          activeCompanyId: true,
          startedAt: true,
          endedAt: true,
          failedPinAttempts: true,
          transcript: true,
        },
      }),
      prisma.ownerAssistantMessage.findMany({
        where: { configId: config.id },
        orderBy: { createdAt: "desc" },
        take: 80,
        select: {
          id: true,
          role: true,
          channel: true,
          content: true,
          createdAt: true,
        },
      }),
      prisma.ownerAssistantToolInvocation.findMany({
        where: { configId: config.id },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          sessionId: true,
          tool: true,
          resultCode: true,
          latencyMs: true,
          errorMessage: true,
          createdAt: true,
          company: { select: { id: true, name: true } },
        },
      }),
    ]);

    return NextResponse.json({ sessions, messages, actions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return NextResponse.json(
      { error: message === "FORBIDDEN" ? "Admin access required" : "Unauthorized" },
      { status: message === "FORBIDDEN" ? 403 : 401 }
    );
  }
}
