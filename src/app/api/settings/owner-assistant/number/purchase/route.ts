import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/api-auth";
import { requireRealAdmin } from "@/lib/owner-assistant/access";
import { verifyOwnerAssistantStepUpToken } from "@/lib/owner-assistant/step-up";
import { prisma } from "@/lib/prisma";
import { purchaseNumber } from "@/lib/twilio/numbers";

export async function POST(request: NextRequest) {
  try {
    const session = await requireSessionUser(request);
    const owner = await requireRealAdmin(session);
    const verified = await verifyOwnerAssistantStepUpToken(request.headers.get("x-owner-assistant-mfa") || "", { userId: owner.id, companyId: owner.companyId });
    if (!verified.ok) return NextResponse.json({ error: verified.error }, { status: 401 });
    const body = await request.json();
    const config = await prisma.ownerAssistantConfig.findUnique({ where: { ownerUserId: owner.id } });
    if (!config) return NextResponse.json({ error: "Save the assistant settings before buying its number" }, { status: 400 });
    if (config.phoneNumberId) return NextResponse.json({ error: "This assistant already has a phone number" }, { status: 409 });
    const number = await purchaseNumber(owner.companyId, String(body.e164 ?? ""), {
      friendlyName: `${config.name} — owner assistant`,
      numberType: "TRACKING",
      trackingSource: "Owner Assistant",
    });
    await prisma.$transaction([
      prisma.phoneNumber.update({ where: { id: number.id }, data: { assignmentLocked: true, assignmentLockedAt: new Date(), assignmentLockedByUserId: owner.id } }),
      prisma.ownerAssistantConfig.update({ where: { id: config.id }, data: { phoneNumberId: number.id } }),
    ]);
    return NextResponse.json({ number }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Purchase failed" }, { status: 500 });
  }
}
