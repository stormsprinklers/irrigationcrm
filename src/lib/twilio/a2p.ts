import { getTwilioClient } from "@/lib/inbox/twilio";
import { normalizePhone, phoneDigitsKey } from "@/lib/inbox/phone";
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

/** IncomingPhoneNumber SIDs currently on the shared Messaging Service. */
export async function listMessagingServiceIncomingSids(
  serviceSid?: string | null
): Promise<Set<string>> {
  const sid = serviceSid ?? getSharedMessagingServiceSid();
  const attached = new Set<string>();
  if (!sid) return attached;

  const client = getTwilioClient();
  try {
    // Auto-paginate so we don't miss numbers beyond the first page.
    const rows = await client.messaging.v1.services(sid).phoneNumbers.list({
      limit: 1000,
    });
    for (const row of rows) {
      const phoneNumberSid =
        (row as { phoneNumberSid?: string }).phoneNumberSid || row.sid;
      if (phoneNumberSid) attached.add(phoneNumberSid);
      if (row.sid) attached.add(row.sid);
    }
  } catch (err) {
    console.error("[a2p] list messaging service numbers failed", err);
  }
  return attached;
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

  const attached = await listMessagingServiceIncomingSids(serviceSid);
  if (attached.has(twilioPhoneSid)) {
    return { ok: true, alreadyAttached: true };
  }

  const client = getTwilioClient();
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

/**
 * Resolve the CRM/Twilio SID for a company From number and ensure it is on the
 * shared A2P Messaging Service (same campaign for every brand).
 */
export async function ensureCompanyFromNumberOnA2p(
  companyId: string,
  fromE164: string
): Promise<
  | { ok: true; twilioSid: string; alreadyAttached: boolean }
  | { ok: false; error: string }
> {
  if (!isA2pMessagingConfigured()) {
    return { ok: false, error: "TWILIO_MESSAGING_SERVICE_SID is not configured" };
  }

  const normalized = normalizePhone(fromE164);
  const wantKey = phoneDigitsKey(normalized);

  const companyNumbers = await prisma.phoneNumber.findMany({
    where: { companyId },
    select: { id: true, e164: true, twilioSid: true, isPrimary: true },
  });

  let row =
    companyNumbers.find((n) => normalizePhone(n.e164) === normalized) ??
    (wantKey
      ? companyNumbers.find((n) => phoneDigitsKey(n.e164) === wantKey)
      : undefined) ??
    companyNumbers.find((n) => n.isPrimary) ??
    null;

  let twilioSid = row?.twilioSid ?? null;

  if (!twilioSid) {
    try {
      const { listAccountNumbers } = await import("@/lib/twilio/numbers");
      const accountNumbers = await listAccountNumbers();
      const match =
        accountNumbers.find((n) => normalizePhone(n.e164) === normalized) ??
        (wantKey
          ? accountNumbers.find((n) => phoneDigitsKey(n.e164) === wantKey)
          : undefined);
      if (match) {
        twilioSid = match.sid;
        if (row) {
          await prisma.phoneNumber.update({
            where: { id: row.id },
            data: { twilioSid },
          });
        }
      }
    } catch (err) {
      console.error("[a2p] resolve Twilio SID failed", err);
    }
  }

  if (!twilioSid) {
    return {
      ok: false,
      error: `No Twilio SID linked for ${normalized}. Import the number from Twilio, then run A2P sync.`,
    };
  }

  const result = await attachNumberToA2pMessagingService(twilioSid);
  if (!result.ok) return result;
  return {
    ok: true,
    twilioSid,
    alreadyAttached: Boolean(result.alreadyAttached),
  };
}

export type A2pNumberStatus = {
  id: string;
  e164: string;
  companyId: string;
  companyName: string;
  isPrimary: boolean;
  twilioSid: string | null;
  onMessagingService: boolean;
};

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

  // Also try numbers that have e164 but missing twilioSid — resolve from Twilio account.
  const missingSid = await prisma.phoneNumber.findMany({
    where: {
      companyId: { in: companyIds },
      twilioSid: null,
    },
    select: { id: true, e164: true, companyId: true },
  });
  if (missingSid.length) {
    try {
      const { listAccountNumbers } = await import("@/lib/twilio/numbers");
      const accountNumbers = await listAccountNumbers();
      const byE164 = new Map(
        accountNumbers.map((n) => [normalizePhone(n.e164), n.sid])
      );
      for (const row of missingSid) {
        const sid = byE164.get(normalizePhone(row.e164));
        if (!sid) continue;
        await prisma.phoneNumber.update({
          where: { id: row.id },
          data: { twilioSid: sid },
        });
        const result = await attachNumberToA2pMessagingService(sid);
        if (result.ok) {
          if (result.alreadyAttached) alreadyAttached += 1;
          else attached += 1;
        } else {
          failed.push({ e164: row.e164, companyId: row.companyId, error: result.error });
        }
      }
    } catch (err) {
      console.error("[a2p] resolve missing SIDs failed", err);
    }
  }

  return {
    messagingServiceSid,
    companyIds,
    attempted: numbers.length + missingSid.length,
    attached,
    alreadyAttached,
    failed,
  };
}

/** Status snapshot for the A2P settings UI across operated companies. */
export async function getA2pStatusForCompanies(companyIds: string[]) {
  const messagingServiceSid = getSharedMessagingServiceSid();
  const companies = await prisma.company.findMany({
    where: { id: { in: companyIds } },
    select: {
      id: true,
      name: true,
      twilioPhone: true,
      phoneNumbers: {
        select: {
          id: true,
          e164: true,
          twilioSid: true,
          isPrimary: true,
        },
        orderBy: [{ isPrimary: "desc" }, { e164: "asc" }],
      },
    },
    orderBy: { name: "asc" },
  });

  const attached = messagingServiceSid
    ? await listMessagingServiceIncomingSids(messagingServiceSid)
    : new Set<string>();

  const numbers: A2pNumberStatus[] = [];
  for (const company of companies) {
    for (const n of company.phoneNumbers) {
      numbers.push({
        id: n.id,
        e164: n.e164,
        companyId: company.id,
        companyName: company.name,
        isPrimary: n.isPrimary || company.twilioPhone === n.e164,
        twilioSid: n.twilioSid,
        onMessagingService: Boolean(n.twilioSid && attached.has(n.twilioSid)),
      });
    }
  }

  const missing = numbers.filter((n) => n.twilioSid && !n.onMessagingService);
  const missingPrimary = missing.filter((n) => n.isPrimary);

  return {
    configured: Boolean(messagingServiceSid),
    messagingServiceSid,
    companies: companies.map((c) => ({
      id: c.id,
      name: c.name,
      phoneNumberCount: c.phoneNumbers.length,
      twilioPhone: c.twilioPhone,
    })),
    numbers,
    twilioLinkedCount: numbers.filter((n) => n.twilioSid).length,
    missingOnServiceCount: missing.length,
    missingPrimaryCount: missingPrimary.length,
  };
}
