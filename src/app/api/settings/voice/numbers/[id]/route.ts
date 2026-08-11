import { NextRequest, NextResponse } from "next/server";
import { PhoneNumberType } from "@prisma/client";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { normalizePhone } from "@/lib/inbox/contacts";
import { syncCompanyTwilioPhone } from "@/lib/voice/company-phone";
import { releaseNumber } from "@/lib/twilio/numbers";
import { verifyPhoneReleaseActionToken } from "@/lib/twilio/phone-release-token";
import { setExclusivePrimaryNumber } from "@/lib/twilio/primary-number";
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

    const existing = await prisma.phoneNumber.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Phone number not found" }, { status: 404 });
    }

    const wantPrimary =
      isPrimary === true ||
      numberType === "PRIMARY" ||
      numberType === PhoneNumberType.PRIMARY;

    if (wantPrimary) {
      await setExclusivePrimaryNumber({ companyId: user.companyId, numberId: id });
      const number = await prisma.phoneNumber.update({
        where: { id },
        data: {
          ...(e164 !== undefined ? { e164: normalizePhone(String(e164)) } : {}),
          ...(friendlyName !== undefined ? { friendlyName: friendlyName || null } : {}),
          ...(callFlowId !== undefined ? { callFlowId: callFlowId || null } : {}),
          ...(assignedUserId !== undefined ? { assignedUserId: assignedUserId || null } : {}),
          ...(trackingSource !== undefined ? { trackingSource: trackingSource || null } : {}),
          isPrimary: true,
          numberType: PhoneNumberType.PRIMARY,
        },
      });
      await syncCompanyTwilioPhone(user.companyId, number.e164);
      try {
        const { ensureCompanyFromNumberOnA2p } = await import("@/lib/twilio/a2p");
        const a2p = await ensureCompanyFromNumberOnA2p(user.companyId, number.e164);
        if (!a2p.ok) {
          console.warn("[numbers] primary set but A2P attach failed", number.e164, a2p.error);
        }
      } catch (err) {
        console.warn("[numbers] primary A2P ensure threw", number.e164, err);
      }
      return NextResponse.json(number);
    }

    // Changing type away from PRIMARY while it was primary — clear primary flag.
    const clearingPrimary =
      (isPrimary === false && existing.isPrimary) ||
      (numberType !== undefined &&
        numberType !== "PRIMARY" &&
        numberType !== PhoneNumberType.PRIMARY &&
        (existing.isPrimary || existing.numberType === PhoneNumberType.PRIMARY));

    const number = await prisma.phoneNumber.update({
      where: { id, companyId: user.companyId },
      data: {
        ...(e164 !== undefined ? { e164: normalizePhone(String(e164)) } : {}),
        ...(friendlyName !== undefined ? { friendlyName: friendlyName || null } : {}),
        ...(callFlowId !== undefined ? { callFlowId: callFlowId || null } : {}),
        ...(isPrimary !== undefined ? { isPrimary: Boolean(isPrimary) } : {}),
        ...(numberType !== undefined ? { numberType } : {}),
        ...(assignedUserId !== undefined ? { assignedUserId: assignedUserId || null } : {}),
        ...(trackingSource !== undefined ? { trackingSource: trackingSource || null } : {}),
        ...(clearingPrimary ? { isPrimary: false } : {}),
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
    const { id } = await params;
    const releaseInTwilio = request.nextUrl.searchParams.get("releaseTwilio") === "true";

    // Releasing a Twilio number is ADMIN-only and requires step-up MFA.
    if (releaseInTwilio) {
      if (user.role !== "ADMIN") {
        return NextResponse.json({ error: "Only admins can release Twilio numbers" }, { status: 403 });
      }
      const mfaToken =
        request.headers.get("x-phone-release-mfa") ??
        request.nextUrl.searchParams.get("mfaToken") ??
        "";
      if (!mfaToken) {
        return NextResponse.json(
          { error: "Admin MFA verification required to release a number" },
          { status: 401 }
        );
      }
      const verified = await verifyPhoneReleaseActionToken(mfaToken, {
        userId: user.id,
        companyId: user.companyId,
      });
      if (!verified.ok) {
        return NextResponse.json({ error: verified.error }, { status: 401 });
      }
      await releaseNumber(user.companyId, id);
      return NextResponse.json({ ok: true });
    }

    // Soft CRM-only unlink (no Twilio release) — still ADMIN/MANAGER.
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.phoneNumber.delete({ where: { id, companyId: user.companyId } });
    return NextResponse.json({ ok: true });
  } catch {
    return unauthorizedResponse();
  }
}
