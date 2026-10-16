import { NextRequest, NextResponse } from "next/server";
import { ownerAssistantBearer, verifyOwnerAssistantToolToken } from "@/lib/owner-assistant/auth";
import { executeOwnerAssistantTool } from "@/lib/owner-assistant/tools";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const token = ownerAssistantBearer(request.headers.get("authorization"));
  const claims = token ? verifyOwnerAssistantToolToken(token) : null;
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const session = await prisma.ownerAssistantSession.findFirst({
    where: { id: claims.sessionId, configId: claims.configId, providerSid: claims.callSid, status: "ACTIVE", pinVerifiedAt: { not: null } },
    select: { id: true },
  });
  if (!session) return NextResponse.json({ error: "Session is not active" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const result = await executeOwnerAssistantTool(
    { configId: claims.configId, ownerUserId: claims.ownerUserId, sessionId: claims.sessionId },
    String(body.tool ?? ""),
    body.arguments
  );
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
