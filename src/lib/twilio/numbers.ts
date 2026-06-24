import { getTwilioClient } from "@/lib/inbox/twilio";
import { normalizePhone } from "@/lib/inbox/contacts";
import { appBaseUrl } from "@/lib/voice/identity";
import { prisma } from "@/lib/prisma";

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
  }));
}

export async function searchAvailableNumbers(areaCode: string, contains?: string) {
  const client = getTwilioClient();
  const numbers = await client.availablePhoneNumbers("US").local.list({
    areaCode: parseInt(areaCode, 10) || undefined,
    contains: contains || undefined,
    smsEnabled: true,
    voiceEnabled: true,
    limit: 20,
  });
  return numbers.map((n) => ({
    e164: n.phoneNumber,
    friendlyName: n.friendlyName,
    locality: n.locality,
    region: n.region,
  }));
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
          data: { twilioSid: num.sid },
        });
        updated++;
      }
      try {
        await configureNumberWebhooks(num.sid);
      } catch (error) {
        console.error("Failed to configure webhooks for", num.e164, error);
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
      },
    });
    try {
      await configureNumberWebhooks(num.sid);
    } catch (error) {
      console.error("Failed to configure webhooks for", num.e164, error);
    }
    imported++;
  }

  return { imported, updated, total: accountNumbers.length };
}
