import { CallAttributionMethod, PhoneNumberType } from "@prisma/client";
import { normalizePhone, phonesMatch } from "@/lib/inbox/phone";
import { prisma } from "@/lib/prisma";

export type CallAttributionResult = {
  method: CallAttributionMethod;
  phoneNumberId: string | null;
  trackingSource: string | null;
  googleLsaLeadId: string | null;
};

/**
 * Attribute an inbound call:
 * 1. Dialed tracking number with trackingSource → DIALED_TRACKING_NUMBER
 * 2. Dialed primary (or untagged) number → try LSA caller-phone match
 * 3. Otherwise PRIMARY_NUMBER / UNKNOWN
 */
export async function resolveInboundCallAttribution(input: {
  companyId: string;
  callerNumber: string;
  dialedNumber: string;
  phoneNumberId?: string | null;
  aroundDate?: Date;
}): Promise<CallAttributionResult> {
  const dialed = normalizePhone(input.dialedNumber);
  const caller = normalizePhone(input.callerNumber);
  const around = input.aroundDate ?? new Date();

  const phoneRecord =
    (input.phoneNumberId
      ? await prisma.phoneNumber.findFirst({
          where: { id: input.phoneNumberId, companyId: input.companyId },
        })
      : null) ??
    (await prisma.phoneNumber.findFirst({
      where: { companyId: input.companyId, e164: dialed },
    }));

  if (phoneRecord?.trackingSource?.trim()) {
    return {
      method: CallAttributionMethod.DIALED_TRACKING_NUMBER,
      phoneNumberId: phoneRecord.id,
      trackingSource: phoneRecord.trackingSource.trim(),
      googleLsaLeadId: null,
    };
  }

  // LSA does not support a dedicated tracking number — match caller phone to an LSA lead.
  const lsaLeadId = await matchGoogleLsaLeadByCallerPhone(
    input.companyId,
    caller,
    around
  );
  if (lsaLeadId) {
    return {
      method: CallAttributionMethod.LSA_CALLER_MATCH,
      phoneNumberId: phoneRecord?.id ?? null,
      trackingSource: "Google LSA",
      googleLsaLeadId: lsaLeadId,
    };
  }

  if (phoneRecord?.numberType === PhoneNumberType.PRIMARY || phoneRecord?.isPrimary) {
    return {
      method: CallAttributionMethod.PRIMARY_NUMBER,
      phoneNumberId: phoneRecord.id,
      trackingSource: phoneRecord.trackingSource?.trim() || "Primary",
      googleLsaLeadId: null,
    };
  }

  return {
    method: CallAttributionMethod.UNKNOWN,
    phoneNumberId: phoneRecord?.id ?? null,
    trackingSource: phoneRecord?.trackingSource?.trim() ?? null,
    googleLsaLeadId: null,
  };
}

/**
 * Match caller phone to a recent Google Local Services lead contact phone.
 * Prefers unmatched leads (not already linked on a CallLog/CallConversion).
 */
export async function matchGoogleLsaLeadByCallerPhone(
  companyId: string,
  callerNumber: string,
  aroundDate: Date,
  windowDays = 14
): Promise<string | null> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      googleAdsRefreshToken: true,
      googleAdsCustomerId: true,
    },
  });
  if (!company?.googleAdsRefreshToken || !company.googleAdsCustomerId) {
    return null;
  }

  try {
    const { getGoogleLsaLeadCandidates } = await import("@/lib/google-ads/lsa-leads");
    const start = new Date(aroundDate);
    start.setUTCDate(start.getUTCDate() - windowDays);
    const end = new Date(aroundDate);
    end.setUTCDate(end.getUTCDate() + 1);

    const leads = await getGoogleLsaLeadCandidates(companyId, {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    });

    const matches = leads.filter((lead) => phonesMatch(lead.phoneNumber, callerNumber));
    if (matches.length === 0) return null;

    const leadIds = matches.map((lead) => lead.id);
    const alreadyLinked = await prisma.callLog.findMany({
      where: {
        companyId,
        googleLsaLeadId: { in: leadIds },
      },
      select: { googleLsaLeadId: true },
    });
    const used = new Set(alreadyLinked.map((row) => row.googleLsaLeadId).filter(Boolean));

    const unused = matches.find((lead) => !used.has(lead.id));
    return (unused ?? matches[0]).id;
  } catch {
    return null;
  }
}
