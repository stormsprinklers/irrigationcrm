import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { normalizePhone } from "@/lib/inbox/contacts";
import { releaseNumber } from "@/lib/twilio/numbers";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { e164, friendlyName, callFlowId, isPrimary, numberType, assignedUserId, trackingSource } = body;

    if (isPrimary) {
      await prisma.phoneNumber.updateMany({
        where: { companyId: user.companyId },
        data: { isPrimary: false },
      });
    }

    const number = await prisma.phoneNumber.update({
      where: { id, companyId: user.companyId },
      data: {
        ...(e164 !== undefined ? { e164: normalizePhone(String(e164)) } : {}),
        ...(friendlyName !== undefined ? { friendlyName } : {}),
        ...(callFlowId !== undefined ? { callFlowId } : {}),
        ...(isPrimary !== undefined ? { isPrimary: Boolean(isPrimary) } : {}),
        ...(numberType !== undefined ? { numberType } : {}),
        ...(assignedUserId !== undefined ? { assignedUserId: assignedUserId || null } : {}),
        ...(trackingSource !== undefined ? { trackingSource: trackingSource || null } : {}),
      },
    });

    return NextResponse.json(number);
  } catch {
    return unauthorizedResponse();
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const releaseInTwilio = request.nextUrl.searchParams.get("releaseTwilio") === "true";

    if (releaseInTwilio) {
      await releaseNumber(user.companyId, id);
    } else {
      await prisma.phoneNumber.delete({ where: { id, companyId: user.companyId } });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return unauthorizedResponse();
  }
}
