import { getTwilioClient } from "@/lib/inbox/twilio";
import { prisma } from "@/lib/prisma";

/** Shared A2P / 10DLC Messaging Service SID (covers all brands on this Twilio account). */
export function getSharedMessagingServiceSid(): string | null {
  const sid = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim();
  return sid || null;
}

export function isA2pMessagingConfigured(): boolean {
  return Boolean(getSharedMessagingServiceSid());
}

/**
 * Company IDs for the current user + all switchable accounts (same email / account links).
 * Used so one person's A2P campaign covers every business they operate.
 */
export async function listUserOperatedCompanyIds(
  userId: string,
  email: string,
  companyId: string
): Promise<string[]> {
  const ids = new Set<string>([companyId]);

  const sameEmail = await prisma.user.findMany({
    where: {
      email: email.toLowerCase(),
      status: "ACTIVE",
      systemKind: null,
    },
    select: { companyId: true },
  });
  for (const row of sameEmail) ids.add(row.companyId);

  const links = await prisma.userAccountLink.findMany({
    where: { userId },
    include: {
      linkedUser: { select: { companyId: true, status: true } },
    },
  });
  for (const link of links) {
    if (link.linkedUser.status === "ACTIVE") {
      ids.add(link.linkedUser.companyId);
    }
  }

  // Reverse links (other user linked to this one)
  const reverseLinks = await prisma.userAccountLink.findMany({
    where: { linkedUserId: userId },
    include: {
      user: { select: { companyId: true, status: true } },
    },
  });
  for (const link of reverseLinks) {
    if (link.user.status === "ACTIVE") {
      ids.add(link.user.companyId);
    }
  }

  return [...ids];
}

/** Attach a Twilio IncomingPhoneNumber SID to the shared Messaging Service (idempotent). */
export async function attachNumberToA2pMessagingService(
  twilioPhoneSid: string
): Promise<{ ok: true; alreadyAttached?: boolean } | { ok: false; error: string }> {
  const serviceSid = getSharedMessagingServiceSid();
  if (!serviceSid) {
    return { ok: false, error: "TWILIO_MESSAGING_SERVICE_SID is not configured" };
  }
  if (!twilioPhoneSid?.startsWith("PN")) {
    return { ok: false, error: "Invalid Twilio phone SID" };
  }

  const client = getTwilioClient();
  try {
    const existing = await client.messaging.v1.services(serviceSid).phoneNumbers.list({
      limit: 200,
    });
    if (
      existing.some(
        (row) =>
          row.sid === twilioPhoneSid ||
          // Twilio Messaging Service PhoneNumber resource exposes the IncomingPhoneNumber SID here.
          (row as { phoneNumberSid?: string }).phoneNumberSid === twilioPhoneSid
      )
    ) {
      return { ok: true, alreadyAttached: true };
    }
  } catch (err) {
    console.error("[a2p] list messaging service numbers failed", err);
    // Continue — create may still succeed or return already-exists.
  }

  try {
    await client.messaging.v1.services(serviceSid).phoneNumbers.create({
      phoneNumberSid: twilioPhoneSid,
    });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Twilio often returns a clear error if already in the service.
    if (/already|exist|duplicate/i.test(message)) {
      return { ok: true, alreadyAttached: true };
    }
    console.error("[a2p] attach number failed", twilioPhoneSid, err);
    return { ok: false, error: message };
  }
}

export type A2pSyncResult = {
  messagingServiceSid: string;
  companyIds: string[];
  attempted: number;
  attached: number;
  alreadyAttached: number;
  failed: Array<{ e164: string; companyId: string; error: string }>;
};

/**
 * Attach every Twilio-linked CRM phone number for the given companies to the shared A2P Messaging Service.
 */
export async function syncCompaniesNumbersToA2p(
  companyIds: string[]
): Promise<A2pSyncResult> {
  const messagingServiceSid = getSharedMessagingServiceSid();
  if (!messagingServiceSid) {
    throw new Error("TWILIO_MESSAGING_SERVICE_SID is not configured");
  }

  const numbers = await prisma.phoneNumber.findMany({
    where: {
      companyId: { in: companyIds },
      twilioSid: { not: null },
    },
    select: { e164: true, twilioSid: true, companyId: true },
  });

  let attached = 0;
  let alreadyAttached = 0;
  const failed: A2pSyncResult["failed"] = [];

  for (const row of numbers) {
    if (!row.twilioSid) continue;
    const result = await attachNumberToA2pMessagingService(row.twilioSid);
    if (result.ok) {
      if (result.alreadyAttached) alreadyAttached += 1;
      else attached += 1;
    } else {
      failed.push({ e164: row.e164, companyId: row.companyId, error: result.error });
    }
  }

  return {
    messagingServiceSid,
    companyIds,
    attempted: numbers.length,
    attached,
    alreadyAttached,
    failed,
  };
}
