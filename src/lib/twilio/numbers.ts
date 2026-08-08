import { getTwilioClient } from "@/lib/inbox/twilio";
import { normalizePhone } from "@/lib/inbox/contacts";
import { appBaseUrl } from "@/lib/voice/identity";
import { prisma } from "@/lib/prisma";
import { normalizeContainsPattern } from "@/lib/twilio/vanity";
import { attachNumberToA2pMessagingService } from "@/lib/twilio/a2p";

export { normalizeContainsPattern, vanityLettersToDigits } from "@/lib/twilio/vanity";

function webhookBase() {
  return appBaseUrl();
}

export function twilioWebhookUrls() {
  const base = webhookBase();
  return {
    base,
    smsInbound: `${base}/api/twilio/sms/inbound`,
    smsStatus: `${base}/api/twilio/sms/status`,
    voiceInbound: `${base}/api/twilio/voice/inbound`,
    voiceStatus: `${base}/api/twilio/voice/status`,
  };
}

export async function configureNumberWebhooks(twilioSid: string) {
  const client = getTwilioClient();
  const urls = twilioWebhookUrls();
  await client.incomingPhoneNumbers(twilioSid).update({
    voiceUrl: urls.voiceInbound,
    voiceMethod: "POST",
    statusCallback: urls.voiceStatus,
    statusCallbackMethod: "POST",
    smsUrl: urls.smsInbound,
    smsMethod: "POST",
  });
}

export async function configureMessagingServiceWebhooks() {
  const client = getTwilioClient();
  const urls = twilioWebhookUrls();
  const services = await client.messaging.v1.services.list({ limit: 50 });
  let updated = 0;

  for (const service of services) {
    await client.messaging.v1.services(service.sid).update({
      inboundRequestUrl: urls.smsInbound,
      inboundMethod: "POST",
    });
    updated++;
  }

  return { messagingServices: updated };
}

export async function configureAllSmsWebhooks(companyId?: string) {
  const client = getTwilioClient();
  const numbers = await client.incomingPhoneNumbers.list({ limit: 100 });
  let phoneNumbers = 0;

  for (const number of numbers) {
    await configureNumberWebhooks(number.sid);
    phoneNumbers++;
  }

  const messaging = await configureMessagingServiceWebhooks();

  if (companyId) {
    const existing = await prisma.phoneNumber.findMany({
      where: { companyId },
      select: { e164: true, twilioSid: true, id: true },
    });
    const byE164 = new Map(existing.map((row) => [row.e164, row]));

    for (const number of numbers) {
      const normalized = normalizePhone(number.phoneNumber);
      const found = byE164.get(normalized);
      if (found && !found.twilioSid) {
        await prisma.phoneNumber.update({
          where: { id: found.id },
          data: { twilioSid: number.sid },
        });
      }
    }
  }

  return {
    phoneNumbers,
    messagingServices: messaging.messagingServices,
    urls: twilioWebhookUrls(),
  };
}

export async function listAccountNumbers() {
  const client = getTwilioClient();
  const numbers = await client.incomingPhoneNumbers.list({ limit: 100 });
  return numbers.map((n) => ({
    sid: n.sid,
    e164: n.phoneNumber,
    friendlyName: n.friendlyName,
    smsEnabled: Boolean(n.capabilities?.sms),
    voiceEnabled: Boolean(n.capabilities?.voice),
  }));
}

/** Map Twilio SID → SMS/voice capabilities for numbers on this account. */
export async function fetchTwilioNumberCapabilitiesBySid(): Promise<
  Map<string, { smsEnabled: boolean; voiceEnabled: boolean }>
> {
  const map = new Map<string, { smsEnabled: boolean; voiceEnabled: boolean }>();
  try {
    const numbers = await listAccountNumbers();
    for (const n of numbers) {
      map.set(n.sid, { smsEnabled: n.smsEnabled, voiceEnabled: n.voiceEnabled });
    }
  } catch (err) {
    console.error("[twilio] fetch capabilities failed", err);
  }
  return map;
}

export type AvailableNumberResult = {
  e164: string;
  friendlyName: string | null;
  locality: string | null;
  region: string | null;
  areaCode: string | null;
};

function parseAreaCodes(areaCodeOrCodes: string | string[] | undefined): string[] {
  const raw = Array.isArray(areaCodeOrCodes)
    ? areaCodeOrCodes
    : String(areaCodeOrCodes ?? "").split(/[\s,]+/);
  const codes = [
    ...new Set(
      raw
        .map((c) => c.replace(/\D/g, "").slice(0, 3))
        .filter((c) => c.length === 3)
    ),
  ];
  return codes;
}

export async function searchAvailableNumbers(
  areaCodeOrCodes?: string | string[],
  contains?: string
): Promise<AvailableNumberResult[]> {
  const client = getTwilioClient();
  const areaCodes = parseAreaCodes(areaCodeOrCodes);
  const pattern = normalizeContainsPattern(contains);

  if (!areaCodes.length && !pattern) {
    throw new Error("Enter at least one area code or a number/vanity pattern to search");
  }

  // Twilio accepts one areaCode per request — search in parallel and merge.
  const targets = areaCodes.length ? areaCodes : [null];
  const batches = await Promise.all(
    targets.map(async (areaCode) => {
      try {
        const numbers = await client.availablePhoneNumbers("US").local.list({
          ...(areaCode ? { areaCode: parseInt(areaCode, 10) } : {}),
          ...(pattern ? { contains: pattern } : {}),
          smsEnabled: true,
          voiceEnabled: true,
          limit: 20,
        });
        return numbers.map((n) => ({
          e164: n.phoneNumber,
          friendlyName: n.friendlyName ?? null,
          locality: n.locality ?? null,
          region: n.region ?? null,
          areaCode:
            areaCode ??
            (n.phoneNumber?.replace(/\D/g, "").length >= 11
              ? n.phoneNumber.replace(/\D/g, "").slice(1, 4)
              : null),
        }));
      } catch (err) {
        console.error("[twilio] available number search failed", { areaCode, pattern, err });
        return [] as AvailableNumberResult[];
      }
    })
  );

  const seen = new Set<string>();
  const merged: AvailableNumberResult[] = [];
  for (const batch of batches) {
    for (const row of batch) {
      if (seen.has(row.e164)) continue;
      seen.add(row.e164);
      merged.push(row);
    }
  }
  return merged;
}

export async function purchaseNumber(
  companyId: string,
  e164: string,
  options?: {
    friendlyName?: string;
    numberType?: "PRIMARY" | "TRACKING" | "AGENT_DIRECT";
    callFlowId?: string | null;
    assignedUserId?: string | null;
    trackingSource?: string | null;
  }
) {
  const client = getTwilioClient();
  const normalized = normalizePhone(e164);

  const purchased = await client.incomingPhoneNumbers.create({
    phoneNumber: normalized,
    friendlyName: options?.friendlyName ?? undefined,
  });

  await configureNumberWebhooks(purchased.sid);

  // Shared A2P / 10DLC campaign — attach every purchased number to the account Messaging Service.
  const a2p = await attachNumberToA2pMessagingService(purchased.sid);
  if (!a2p.ok) {
    console.warn("[twilio] purchased number but A2P attach failed", purchased.sid, a2p.error);
  }

  return prisma.phoneNumber.create({
    data: {
      companyId,
      e164: normalized,
      friendlyName: options?.friendlyName ?? purchased.friendlyName ?? null,
      twilioSid: purchased.sid,
      numberType: options?.numberType ?? "TRACKING",
      callFlowId: options?.callFlowId ?? null,
      assignedUserId: options?.assignedUserId ?? null,
      trackingSource: options?.trackingSource ?? null,
      smsEnabled: Boolean(purchased.capabilities?.sms),
      voiceEnabled: Boolean(purchased.capabilities?.voice),
    },
  });
}

export async function releaseNumber(companyId: string, phoneNumberId: string) {
  const record = await prisma.phoneNumber.findFirst({
    where: { id: phoneNumberId, companyId },
  });
  if (!record) throw new Error("Phone number not found");

  if (record.twilioSid) {
    const client = getTwilioClient();
    await client.incomingPhoneNumbers(record.twilioSid).remove();
  }

  await prisma.phoneNumber.delete({ where: { id: record.id } });
}

export async function syncAccountNumbers(companyId: string) {
  const accountNumbers = await listAccountNumbers();
  const existing = await prisma.phoneNumber.findMany({
    where: { companyId },
    select: { e164: true, twilioSid: true, id: true },
  });
  const existingByE164 = new Map(existing.map((n) => [n.e164, n]));

  let imported = 0;
  let updated = 0;

  for (const num of accountNumbers) {
    const normalized = normalizePhone(num.e164);
    const found = existingByE164.get(normalized);
    if (found) {
      if (!found.twilioSid) {
        await prisma.phoneNumber.update({
          where: { id: found.id },
          data: {
            twilioSid: num.sid,
            smsEnabled: num.smsEnabled,
            voiceEnabled: num.voiceEnabled,
          },
        });
        updated++;
      } else {
        await prisma.phoneNumber.update({
          where: { id: found.id },
          data: {
            smsEnabled: num.smsEnabled,
            voiceEnabled: num.voiceEnabled,
          },
        });
      }
      try {
        await configureNumberWebhooks(num.sid);
      } catch (error) {
        console.error("Failed to configure webhooks for", num.e164, error);
      }
      try {
        const a2p = await attachNumberToA2pMessagingService(num.sid);
        if (!a2p.ok) {
          console.warn("[twilio] sync A2P attach failed", num.e164, a2p.error);
        }
      } catch (error) {
        console.error("Failed to attach A2P for", num.e164, error);
      }
      continue;
    }

    await prisma.phoneNumber.create({
      data: {
        companyId,
        e164: normalized,
        friendlyName: num.friendlyName ?? null,
        twilioSid: num.sid,
        numberType: "TRACKING",
        smsEnabled: num.smsEnabled,
        voiceEnabled: num.voiceEnabled,
      },
    });
    try {
      await configureNumberWebhooks(num.sid);
    } catch (error) {
      console.error("Failed to configure webhooks for", num.e164, error);
    }
    try {
      const a2p = await attachNumberToA2pMessagingService(num.sid);
      if (!a2p.ok) {
        console.warn("[twilio] sync A2P attach failed", num.e164, a2p.error);
      }
    } catch (error) {
      console.error("Failed to attach A2P for", num.e164, error);
    }
    imported++;
  }

  return { imported, updated, total: accountNumbers.length };
}
