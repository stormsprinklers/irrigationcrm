import { NextRequest, NextResponse } from "next/server";
import { ownerAssistantBearer, verifyOwnerAssistantToolToken } from "@/lib/owner-assistant/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const token = ownerAssistantBearer(request.headers.get("authorization"));
  const claims = token ? verifyOwnerAssistantToolToken(token) : null;
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const session = await prisma.ownerAssistantSession.findFirst({ where: { id: claims.sessionId, configId: claims.configId, providerSid: claims.callSid } });
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const append = typeof body.transcriptAppend === "string" ? body.transcriptAppend.slice(0, 8000) : "";
  const status = ["ACTIVE", "COMPLETED", "FAILED"].includes(String(body.status)) ? String(body.status) : undefined;
  await prisma.ownerAssistantSession.update({
    where: { id: session.id },
    data: {
      ...(append ? { transcript: `${session.transcript}${append}`.slice(-100_000) } : {}),
      ...(status ? { status, ...(status !== "ACTIVE" ? { endedAt: new Date() } : {}) } : {}),
    },
  });
  return NextResponse.json({ ok: true });
}
