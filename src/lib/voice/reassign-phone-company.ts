import { PhoneNumberType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { setExclusivePrimaryNumber } from "@/lib/twilio/primary-number";
import { syncCompanyTwilioPhone } from "@/lib/voice/company-phone";
import { attachNumberToA2pMessagingService } from "@/lib/twilio/a2p";
import { configureNumberWebhooks } from "@/lib/twilio/numbers";

export class PhoneCompanyReassignError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "PhoneCompanyReassignError";
    this.status = status;
  }
}

/**
 * Move a CRM phone number to another company the operator manages.
 * Clears company-scoped links (call flow, assigned user). If it was primary
 * on the source company, promotes another number there (or clears twilioPhone).
 * If the target has no primary, this number becomes primary.
 */
export async function reassignPhoneNumberToCompany(params: {
  numberId: string;
  toCompanyId: string;
  /** Companies the caller is allowed to move between (source + target must both be in this set). */
  allowedCompanyIds: string[];
}) {
  const allowed = new Set(params.allowedCompanyIds);
  if (!allowed.has(params.toCompanyId)) {
    throw new PhoneCompanyReassignError(
      "You cannot assign numbers to that company",
      403
    );
  }

  const existing = await prisma.phoneNumber.findFirst({
    where: { id: params.numberId, companyId: { in: [...allowed] } },
  });
  if (!existing) {
    throw new PhoneCompanyReassignError("Phone number not found", 404);
  }
  if (existing.companyId === params.toCompanyId) {
    return existing;
  }
  if (!allowed.has(existing.companyId)) {
    throw new PhoneCompanyReassignError(
      "You cannot move numbers from that company",
      403
    );
  }

  const clash = await prisma.phoneNumber.findFirst({
    where: {
      companyId: params.toCompanyId,
      OR: [
        { e164: existing.e164 },
        ...(existing.twilioSid ? [{ twilioSid: existing.twilioSid }] : []),
      ],
      NOT: { id: existing.id },
    },
  });
  if (clash) {
    // Target already owns this Twilio line (often after sync re-imported a ghost
    // under the source company). Drop the duplicate and keep the target row.
    const fromCompanyId = existing.companyId;
    const wasPrimary =
      existing.isPrimary || existing.numberType === PhoneNumberType.PRIMARY;
    await prisma.phoneNumber.delete({ where: { id: existing.id } });
    if (wasPrimary) {
      await promoteOrClearPrimary(fromCompanyId);
    }
    await ensureTwilioReadyForNumber(clash.twilioSid);
    return clash;
  }

  const fromCompanyId = existing.companyId;
  const wasPrimary =
    existing.isPrimary || existing.numberType === PhoneNumberType.PRIMARY;

  const updated = await prisma.phoneNumber.update({
    where: { id: existing.id },
    data: {
      companyId: params.toCompanyId,
      callFlowId: null,
      assignedUserId: null,
      isPrimary: false,
      numberType:
        existing.numberType === PhoneNumberType.PRIMARY
          ? PhoneNumberType.TRACKING
          : existing.numberType,
    },
  });

  if (wasPrimary) {
    await promoteOrClearPrimary(fromCompanyId);
  }

  const targetHasPrimary = await prisma.phoneNumber.count({
    where: {
      companyId: params.toCompanyId,
      OR: [{ isPrimary: true }, { numberType: PhoneNumberType.PRIMARY }],
    },
  });
  if (targetHasPrimary === 0) {
    await setExclusivePrimaryNumber({
      companyId: params.toCompanyId,
      numberId: updated.id,
    });
    await syncCompanyTwilioPhone(params.toCompanyId, updated.e164).catch(
      () => undefined
    );
  }

  await ensureTwilioReadyForNumber(updated.twilioSid);

  return (
    (await prisma.phoneNumber.findUnique({ where: { id: updated.id } })) ??
    updated
  );
}

async function promoteOrClearPrimary(companyId: string) {
  const nextPrimary = await prisma.phoneNumber.findFirst({
    where: { companyId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
  if (nextPrimary) {
    await setExclusivePrimaryNumber({
      companyId,
      numberId: nextPrimary.id,
    });
    await syncCompanyTwilioPhone(companyId, nextPrimary.e164).catch(() => undefined);
    return;
  }
  await prisma.company
    .update({
      where: { id: companyId },
      data: { twilioPhone: null },
    })
    .catch(() => undefined);
}

async function ensureTwilioReadyForNumber(twilioSid: string | null | undefined) {
  if (!twilioSid?.startsWith("PN")) return;
  try {
    await configureNumberWebhooks(twilioSid);
  } catch (error) {
    console.error("[reassign] webhook configure failed", twilioSid, error);
  }
  try {
    const a2p = await attachNumberToA2pMessagingService(twilioSid);
    if (!a2p.ok) {
      console.warn("[reassign] A2P attach failed", twilioSid, a2p.error);
    }
  } catch (error) {
    console.error("[reassign] A2P attach error", twilioSid, error);
  }
}
