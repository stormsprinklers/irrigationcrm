import { getTwilioClient } from "@/lib/inbox/twilio";
import { normalizePhone, phoneDigitsKey } from "@/lib/inbox/phone";
import { prisma } from "@/lib/prisma";

const PLATFORM_SETTINGS_ID = "default";

export type TwilioMessagingServiceOption = {
  sid: string;
  friendlyName: string | null;
  inboundRequestUrl: string | null;
};

/** List Messaging Services on the Twilio account for in-app A2P selection. */
export async function listTwilioMessagingServices(): Promise<TwilioMessagingServiceOption[]> {
  const client = getTwilioClient();
  const rows = await client.messaging.v1.services.list({ limit: 100 });
  return rows.map((s) => ({
    sid: s.sid,
    friendlyName: s.friendlyName ?? null,
    inboundRequestUrl: s.inboundRequestUrl ?? null,
  }));
}

/**
 * Shared A2P / 10DLC Messaging Service SID for every brand on this Twilio account.
 * Prefer in-app setting (Settings → A2P campaign); env is optional legacy fallback.
 */
export async function getSharedMessagingServiceSid(): Promise<string | null> {
  try {
    const row = await prisma.twilioPlatformSettings.findUnique({
      where: { id: PLATFORM_SETTINGS_ID },
      select: { messagingServiceSid: true },
    });
    const fromDb = row?.messagingServiceSid?.trim();
    if (fromDb) return fromDb;
  } catch (err) {
    // Table may not exist until db push — fall through to env / auto-detect.
    console.warn("[a2p] read platform settings failed", err);
  }

  const fromEnv = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim();
  if (fromEnv) return fromEnv;

  return null;
}

export async function isA2pMessagingConfigured(): Promise<boolean> {
  return Boolean(await getSharedMessagingServiceSid());
}

export async function saveSharedMessagingServiceSid(params: {
  messagingServiceSid: string | null;
  updatedByUserId?: string | null;
}): Promise<string | null> {
  const sid = params.messagingServiceSid?.trim() || null;
  if (sid && !/^MG[0-9a-fA-F]{32}$/i.test(sid)) {
    throw new Error("Messaging Service SID must look like MGxxxxxxxx…");
  }

  await prisma.twilioPlatformSettings.upsert({
    where: { id: PLATFORM_SETTINGS_ID },
    create: {
      id: PLATFORM_SETTINGS_ID,
      messagingServiceSid: sid,
      updatedByUserId: params.updatedByUserId ?? null,
    },
    update: {
      messagingServiceSid: sid,
      updatedByUserId: params.updatedByUserId ?? null,
    },
  });

  return sid;
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

/** IncomingPhoneNumber SIDs + E.164s currently on the shared Messaging Service. */
export async function listMessagingServiceNumbers(
  serviceSid?: string | null
): Promise<{
  sids: Set<string>;
  e164s: Set<string>;
  count: number;
  error: string | null;
}> {
  const sid = serviceSid ?? (await getSharedMessagingServiceSid());
  const sids = new Set<string>();
  const e164s = new Set<string>();
  if (!sid) {
    return {
      sids,
      e164s,
      count: 0,
      error: "No Messaging Service selected. Choose one on the A2P campaign tab.",
    };
  }

  const client = getTwilioClient();
  try {
    const rows = await client.messaging.v1.services(sid).phoneNumbers.list({
      limit: 1000,
    });
    for (const row of rows) {
      // Messaging Service PhoneNumber.sid is the IncomingPhoneNumber PN… SID.
      const phoneNumberSid =
        (row as { phoneNumberSid?: string }).phoneNumberSid || row.sid;
      if (phoneNumberSid) sids.add(phoneNumberSid);
      if (row.sid) sids.add(row.sid);
      const e164 = (row as { phoneNumber?: string }).phoneNumber;
      if (e164) {
        e164s.add(normalizePhone(e164));
        const key = phoneDigitsKey(e164);
        if (key) e164s.add(key);
      }
    }
    return { sids, e164s, count: rows.length, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[a2p] list messaging service numbers failed", err);
    return { sids, e164s, count: 0, error: message };
  }
}

/** IncomingPhoneNumber SIDs currently on the shared Messaging Service. */
export async function listMessagingServiceIncomingSids(
  serviceSid?: string | null
): Promise<Set<string>> {
  const listed = await listMessagingServiceNumbers(serviceSid);
  return listed.sids;
}

/** Attach a Twilio IncomingPhoneNumber SID to the shared Messaging Service (idempotent). */
export async function attachNumberToA2pMessagingService(
  twilioPhoneSid: string
): Promise<{ ok: true; alreadyAttached?: boolean; movedFromServiceSid?: string } | { ok: false; error: string }> {
  const serviceSid = await getSharedMessagingServiceSid();
  if (!serviceSid) {
    return {
      ok: false,
      error: "No Messaging Service selected. Open Settings → Phone numbers → A2P campaign and choose one.",
    };
  }
  if (!twilioPhoneSid?.startsWith("PN")) {
    return { ok: false, error: "Invalid Twilio phone SID" };
  }

  const listed = await listMessagingServiceNumbers(serviceSid);
  if (listed.error) {
    return {
      ok: false,
      error: `Cannot read Messaging Service ${serviceSid}: ${listed.error}. Pick a different service on the A2P tab.`,
    };
  }
  if (listed.sids.has(twilioPhoneSid)) {
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
    const code =
      err && typeof err === "object" && "code" in err
        ? Number((err as { code?: unknown }).code)
        : null;

    // Already on this service (race / duplicate).
    if (code === 21710 || /already|exist|duplicate/i.test(message)) {
      return { ok: true, alreadyAttached: true };
    }

    // On a different Messaging Service — move to the shared A2P service.
    if (
      code === 21712 ||
      /another Messaging Service|associated with another/i.test(message)
    ) {
      const moved = await movePhoneNumberToMessagingService(twilioPhoneSid, serviceSid);
      if (moved.ok) return moved;
      return {
        ok: false,
        error:
          moved.error ||
          "Number is on a different Messaging Service. Remove it from that Sender Pool in Twilio Console, then attach again.",
      };
    }

    console.error("[a2p] attach number failed", twilioPhoneSid, err);
    return { ok: false, error: message };
  }
}

/** Remove PN from any other Messaging Service, then add to the target service. */
async function movePhoneNumberToMessagingService(
  twilioPhoneSid: string,
  targetServiceSid: string
): Promise<
  | { ok: true; alreadyAttached?: boolean; movedFromServiceSid?: string }
  | { ok: false; error: string }
> {
  const client = getTwilioClient();
  let movedFrom: string | null = null;

  try {
    const services = await client.messaging.v1.services.list({ limit: 100 });
    for (const service of services) {
      if (service.sid === targetServiceSid) continue;
      try {
        const onService = await client.messaging.v1
          .services(service.sid)
          .phoneNumbers.list({ limit: 1000 });
        const match = onService.find(
          (row) =>
            row.sid === twilioPhoneSid ||
            (row as { phoneNumberSid?: string }).phoneNumberSid === twilioPhoneSid
        );
        if (!match) continue;
        await client.messaging.v1
          .services(service.sid)
          .phoneNumbers(match.sid)
          .remove();
        movedFrom = service.sid;
      } catch (err) {
        console.warn("[a2p] scan/remove from other messaging service failed", service.sid, err);
      }
    }

    await client.messaging.v1.services(targetServiceSid).phoneNumbers.create({
      phoneNumberSid: twilioPhoneSid,
    });
    return {
      ok: true,
      movedFromServiceSid: movedFrom ?? undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[a2p] move number to messaging service failed", twilioPhoneSid, err);
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
  if (!(await isA2pMessagingConfigured())) {
    return {
      ok: false,
      error: "No Messaging Service selected. Open Settings → Phone numbers → A2P campaign and choose one.",
    };
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
  const messagingServiceSid = await getSharedMessagingServiceSid();
  if (!messagingServiceSid) {
    throw new Error(
      "No Messaging Service selected. Open Settings → Phone numbers → A2P campaign and choose one."
    );
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
  const messagingServiceSid = await getSharedMessagingServiceSid();
  let availableServices: TwilioMessagingServiceOption[] = [];
  let servicesError: string | null = null;
  try {
    availableServices = await listTwilioMessagingServices();
  } catch (err) {
    servicesError = err instanceof Error ? err.message : String(err);
  }

  // Source of the currently resolved SID (for UI clarity).
  let sidSource: "app" | "env" | null = null;
  try {
    const row = await prisma.twilioPlatformSettings.findUnique({
      where: { id: PLATFORM_SETTINGS_ID },
      select: { messagingServiceSid: true },
    });
    if (row?.messagingServiceSid?.trim()) sidSource = "app";
    else if (process.env.TWILIO_MESSAGING_SERVICE_SID?.trim() && messagingServiceSid) {
      sidSource = "env";
    }
  } catch {
    if (process.env.TWILIO_MESSAGING_SERVICE_SID?.trim() && messagingServiceSid) {
      sidSource = "env";
    }
  }

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

  const listed = messagingServiceSid
    ? await listMessagingServiceNumbers(messagingServiceSid)
    : {
        sids: new Set<string>(),
        e164s: new Set<string>(),
        count: 0,
        error: null as string | null,
      };

  const numbers: A2pNumberStatus[] = [];
  for (const company of companies) {
    for (const n of company.phoneNumbers) {
      const normalized = normalizePhone(n.e164);
      const digitKey = phoneDigitsKey(n.e164);
      const onMessagingService = Boolean(
        (n.twilioSid && listed.sids.has(n.twilioSid)) ||
          listed.e164s.has(normalized) ||
          (digitKey && listed.e164s.has(digitKey))
      );
      numbers.push({
        id: n.id,
        e164: n.e164,
        companyId: company.id,
        companyName: company.name,
        isPrimary: n.isPrimary || company.twilioPhone === n.e164,
        twilioSid: n.twilioSid,
        onMessagingService,
      });
    }
  }

  const missing = numbers.filter((n) => n.twilioSid && !n.onMessagingService);
  const missingPrimary = missing.filter((n) => n.isPrimary);
  const selectedService =
    availableServices.find((s) => s.sid === messagingServiceSid) ?? null;

  return {
    configured: Boolean(messagingServiceSid),
    messagingServiceSid,
    messagingServiceName: selectedService?.friendlyName ?? null,
    sidSource,
    availableServices,
    servicesError,
    messagingServiceNumberCount: listed.count,
    listError: listed.error,
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
