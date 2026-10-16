import { NextRequest, NextResponse } from "next/server";
import { listOwnerAssistantCompanies } from "@/lib/owner-assistant/access";
import { createOwnerAssistantToolToken, verifyOwnerAssistantStreamToken } from "@/lib/owner-assistant/auth";
import { isOwnerAssistantAvailable } from "@/lib/owner-assistant/availability";
import { buildOwnerAssistantPrompt } from "@/lib/owner-assistant/prompt";
import { OWNER_ASSISTANT_TOOLS } from "@/lib/owner-assistant/types";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const claims = verifyOwnerAssistantStreamToken(String(body.token ?? ""));
    if (!claims) return NextResponse.json({ error: "Invalid or expired stream token" }, { status: 401 });
    const session = await prisma.ownerAssistantSession.findFirst({
      where: { id: claims.sessionId, configId: claims.configId, providerSid: claims.callSid, pinVerifiedAt: { not: null }, status: "ACTIVE" },
      include: { config: { include: { owner: { select: { id: true, name: true, email: true, companyId: true } } } } },
    });
    if (!session?.config.enabled || !isOwnerAssistantAvailable(session.config.availabilityJson)) {
      return NextResponse.json({ error: "Owner assistant unavailable" }, { status: 403 });
    }
    const companies = await listOwnerAssistantCompanies(session.config.owner);
    const toolBearer = createOwnerAssistantToolToken({
      configId: session.configId,
      sessionId: session.id,
      callSid: session.providerSid,
      ownerUserId: session.config.ownerUserId,
    });
    return NextResponse.json({
      sessionId: session.id,
      companyId: session.config.homeCompanyId,
      callSid: session.providerSid,
      voice: session.config.voice,
      maxCallMinutes: Math.min(30, Math.max(5, session.config.maxCallMinutes)),
      instructions: buildOwnerAssistantPrompt({ name: session.config.name, ownerName: session.config.owner.name, companies }),
      tools: OWNER_ASSISTANT_TOOLS,
      toolBearer,
    });
  } catch (error) {
    console.error("[owner-assistant] session bootstrap failed", error);
    return NextResponse.json({ error: "Session failed" }, { status: 500 });
  }
}
