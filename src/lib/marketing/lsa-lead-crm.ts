import { findCustomerByPhone } from "@/lib/inbox/customer-lookup";
import { phoneDigitsKey, phonesMatch } from "@/lib/inbox/phone";
import { prisma } from "@/lib/prisma";
import type { AdsLsaLeadRow } from "@/lib/marketing/ads-dashboard";
import { callRecordingPlaybackPath } from "@/lib/voice/recording";

export async function enrichLsaLeadsWithCrm(
  companyId: string,
  leads: AdsLsaLeadRow[]
): Promise<AdsLsaLeadRow[]> {
  if (!leads.length) return leads;

  const leadIds = leads.map((lead) => lead.id);
  const last10s = [
    ...new Set(
      leads
        .map((lead) => phoneDigitsKey(lead.phoneNumber))
        .filter((key): key is string => Boolean(key && key.length === 10))
    ),
  ];
  const fromVariants = last10s.flatMap((key) => [key, `+1${key}`, `1${key}`]);

  const calls = await prisma.callLog.findMany({
    where: {
      companyId,
      direction: "INBOUND",
      OR: [
        { googleLsaLeadId: { in: leadIds } },
        ...(fromVariants.length ? [{ fromNumber: { in: fromVariants } }] : []),
      ],
    },
    select: {
      id: true,
      fromNumber: true,
      googleLsaLeadId: true,
      startedAt: true,
      durationSec: true,
      aiSummary: true,
      recordingUrl: true,
    },
    orderBy: { startedAt: "desc" },
    take: 400,
  });

  const customerByLast10 = new Map<string, { id: string; name: string }>();
  await Promise.all(
    last10s.map(async (key) => {
      const customer = await findCustomerByPhone(companyId, `+1${key}`);
      if (customer) customerByLast10.set(key, { id: customer.id, name: customer.name });
    })
  );

  return leads.map((lead) => {
    const last10 = phoneDigitsKey(lead.phoneNumber);
    const customer = last10 ? customerByLast10.get(last10) ?? null : null;
    const matchedCalls = calls
      .filter(
        (call) =>
          call.googleLsaLeadId === lead.id ||
          (lead.phoneNumber && phonesMatch(call.fromNumber, lead.phoneNumber))
      )
      .slice(0, 8)
      .map((call) => ({
        id: call.id,
        startedAt: call.startedAt.toISOString(),
        durationSec: call.durationSec,
        aiSummary: call.aiSummary?.trim() || null,
        hasRecording: Boolean(call.recordingUrl),
        recordingPlaybackUrl: call.recordingUrl ? callRecordingPlaybackPath(call.id) : null,
      }));

    return {
      ...lead,
      customer,
      calls: matchedCalls,
    };
  });
}
