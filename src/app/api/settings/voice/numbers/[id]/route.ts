import { NextRequest, NextResponse } from "next/server";
import { PhoneNumberType } from "@prisma/client";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { normalizePhone } from "@/lib/inbox/contacts";
import { syncCompanyTwilioPhone } from "@/lib/voice/company-phone";
import {
  PhoneCompanyReassignError,
  reassignPhoneNumberToCompany,
} from "@/lib/voice/reassign-phone-company";
import { releaseNumber } from "@/lib/twilio/numbers";
import {
  PHONE_ASSIGNMENT_PURPOSE,
  verifyPhoneReleaseActionToken,
  verifyPhoneStepUpToken,
} from "@/lib/twilio/phone-release-token";
import { setExclusivePrimaryNumber } from "@/lib/twilio/primary-number";
import { attachNumberToA2pMessagingService, listUserOperatedCompanyIds } from "@/lib/twilio/a2p";
import { prisma } from "@/lib/prisma";

async function operatedCompanyIdsFor(user: {
  id: string;
  companyId: string;
}): Promise<string[]> {
  const sessionUser = await prisma.user.findFirst({
    where: { id: user.id },
    select: { email: true },
  });
  if (!sessionUser?.email) return [user.companyId];
  return listUserOperatedCompanyIds(user.id, sessionUser.email, user.companyId);
}

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
    const {
      e164,
      friendlyName,
      callFlowId,
      isPrimary,
      numberType,
      assignedUserId,
      trackingSource,
      companyId: nextCompanyId,
      messagingServiceSid: nextMessagingServiceSid,
      assignmentLocked: nextAssignmentLocked,
    } = body;

    const allowedCompanyIds = await operatedCompanyIdsFor(user);

    let existing = await prisma.phoneNumber.findFirst({
      where: { id, companyId: { in: allowedCompanyIds } },
    });
    if (!existing) {
      return NextResponse.json({ error: "Phone number not found" }, { status: 404 });
    }

    const changingCompany =
      nextCompanyId !== undefined &&
      nextCompanyId !== null &&
      String(nextCompanyId) !== existing.companyId;
    const campaignSid =
      nextMessagingServiceSid === undefined || nextMessagingServiceSid === null
        ? undefined
        : String(nextMessagingServiceSid).trim();
    const changingCampaign = Boolean(campaignSid);
    const locking = nextAssignmentLocked === true && !existing.assignmentLocked;
    const unlocking = nextAssignmentLocked === false && existing.assignmentLocked;
    const needsAssignmentMfa =
      existing.assignmentLocked && (changingCompany || changingCampaign || unlocking);

    if (needsAssignmentMfa) {
      const mfaToken =
        request.headers.get("x-phone-assignment-mfa") ??
        request.nextUrl.searchParams.get("assignmentMfa") ??
        "";
      if (!mfaToken) {
        return NextResponse.json(
          { error: "2FA verification required to change locked company or campaign assignment" },
          { status: 401 }
        );
      }
      const verified = await verifyPhoneStepUpToken(mfaToken, {
        userId: user.id,
        companyId: user.companyId,
        purpose: PHONE_ASSIGNMENT_PURPOSE,
      });
      if (!verified.ok) {
        return NextResponse.json({ error: verified.error }, { status: 401 });
      }
    }

    if (locking || unlocking) {
      existing = await prisma.phoneNumber.update({
        where: { id },
        data: unlocking
          ? {
              assignmentLocked: false,
              assignmentLockedAt: null,
              assignmentLockedByUserId: null,
            }
          : {
              assignmentLocked: true,
              assignmentLockedAt: new Date(),
              assignmentLockedByUserId: user.id,
            },
      });
    }

    if (changingCompany) {
      try {
        existing = await reassignPhoneNumberToCompany({
          numberId: id,
          toCompanyId: String(nextCompanyId),
          allowedCompanyIds,
          messagingServiceSid: changingCampaign ? campaignSid : undefined,
        });
      } catch (err) {
        if (err instanceof PhoneCompanyReassignError) {
          return NextResponse.json({ error: err.message }, { status: err.status });
        }
        throw err;
      }
    } else if (changingCampaign) {
      if (!existing.twilioSid) {
        return NextResponse.json(
          { error: "This number is not linked to Twilio, so it cannot join a campaign." },
          { status: 400 }
        );
      }
      const a2p = await attachNumberToA2pMessagingService(existing.twilioSid, {
        companyId: existing.companyId,
        messagingServiceSid: campaignSid,
      });
      if (!a2p.ok) {
        return NextResponse.json({ error: a2p.error }, { status: 400 });
      }
    }

    const companyId = existing.companyId;
    const onlyAssignmentChange =
      (changingCompany || changingCampaign || locking || unlocking) &&
      e164 === undefined &&
      friendlyName === undefined &&
      callFlowId === undefined &&
      isPrimary === undefined &&
      numberType === undefined &&
      assignedUserId === undefined &&
      trackingSource === undefined;
    if (onlyAssignmentChange) {
      return NextResponse.json(existing);
    }

    const wantPrimary =
      isPrimary === true ||
      numberType === "PRIMARY" ||
      numberType === PhoneNumberType.PRIMARY;

    if (wantPrimary) {
      await setExclusivePrimaryNumber({ companyId, numberId: id });
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
      await syncCompanyTwilioPhone(companyId, number.e164);
      try {
        const { ensureCompanyFromNumberOnA2p } = await import("@/lib/twilio/a2p");
        const a2p = await ensureCompanyFromNumberOnA2p(companyId, number.e164);
        if (!a2p.ok) {
          console.warn("[numbers] primary set but A2P attach failed", number.e164, a2p.error);
        }
      } catch (err) {
        console.warn("[numbers] primary A2P ensure threw", number.e164, err);
      }
      return NextResponse.json(number);
    }

    const clearingPrimary =
      (isPrimary === false && existing.isPrimary) ||
      (numberType !== undefined &&
        numberType !== "PRIMARY" &&
        numberType !== PhoneNumberType.PRIMARY &&
        (existing.isPrimary || existing.numberType === PhoneNumberType.PRIMARY));

    const number = await prisma.phoneNumber.update({
      where: { id },
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
    const allowedCompanyIds = await operatedCompanyIdsFor(user);

    const existing = await prisma.phoneNumber.findFirst({
      where: { id, companyId: { in: allowedCompanyIds } },
    });
    if (!existing) {
      return NextResponse.json({ error: "Phone number not found" }, { status: 404 });
    }

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
      await releaseNumber(existing.companyId, id);
      return NextResponse.json({ ok: true });
    }

    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.phoneNumber.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return unauthorizedResponse();
  }
}
