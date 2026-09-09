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

export async function getMessagingServiceSidForCompany(companyId: string): Promise<string | null> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { a2pMessagingServiceSid: true },
  });
  const fromCompany = company?.a2pMessagingServiceSid?.trim();
  if (fromCompany) return fromCompany;
  return getSharedMessagingServiceSid();
}

export async function saveCompanyMessagingServiceSid(params: {
  companyId: string;
  messagingServiceSid: string | null;
}): Promise<string | null> {
  const sid = params.messagingServiceSid?.trim() || null;
  if (sid && !/^MG[0-9a-fA-F]{32}$/i.test(sid)) {
    throw new Error("Messaging Service SID must look like MGxxxxxxxx…");
  }
  await prisma.company.update({
    where: { id: params.companyId },
    data: { a2pMessagingServiceSid: sid },
  });
  if (sid) {
    const { ensureMessagingServiceInboundWebhook } = await import("@/lib/twilio/numbers");
    const webhook = await ensureMessagingServiceInboundWebhook(sid);
    if (!webhook.ok) {
      console.warn(
        "[a2p] saved company Messaging Service but could not set inbound webhook",
        params.companyId,
        sid,
        webhook.error
      );
    }
  }
  return sid;
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

  // Inbound texts to every number on this service must hit the CRM SMS inbox.
  if (sid) {
    const { ensureMessagingServiceInboundWebhook } = await import("@/lib/twilio/numbers");
    const webhook = await ensureMessagingServiceInboundWebhook(sid);
    if (!webhook.ok) {
      console.warn(
        "[a2p] saved Messaging Service but could not set inbound webhook",
        sid,
        webhook.error
      );
    }
  }

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

/** Attach a Twilio IncomingPhoneNumber SID to a Messaging Service (idempotent). */
export async function attachNumberToA2pMessagingService(
  twilioPhoneSid: string,
  options?: { companyId?: string; messagingServiceSid?: string | null }
): Promise<{ ok: true; alreadyAttached?: boolean; movedFromServiceSid?: string } | { ok: false; error: string }> {
  const serviceSid =
    options?.messagingServiceSid?.trim() ||
    (options?.companyId
      ? await getMessagingServiceSidForCompany(options.companyId)
      : await getSharedMessagingServiceSid());
  if (!serviceSid) {
    return {
      ok: false,
      error:
        "No Messaging Service selected for this company. Open Settings → Phone numbers → A2P campaign and choose one.",
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

    // On a different Messaging Service — move to the target campaign.
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
 * Resolve the CRM/Twilio SID for a company From number and ensure it is on that
 * company’s A2P Messaging Service (falling back to the shared service).
 */
export async function ensureCompanyFromNumberOnA2p(
  companyId: string,
  fromE164: string
): Promise<
  | { ok: true; twilioSid: string; alreadyAttached: boolean }
  | { ok: false; error: string }
> {
  const serviceSid = await getMessagingServiceSidForCompany(companyId);
  if (!serviceSid) {
    return {
      ok: false,
      error:
        "No Messaging Service selected for this company. Open Settings → Phone numbers → A2P campaign and choose one.",
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

  const result = await attachNumberToA2pMessagingService(twilioSid, {
    companyId,
    messagingServiceSid: serviceSid,
  });
  if (!result.ok) return result;
  return {
    ok: true,
    twilioSid,
    alreadyAttached: Boolean(result.alreadyAttached),
  };
}

export type PhoneA2pAssignment = {
  messagingServiceSid: string;
  messagingServiceName: string | null;
  campaignUsecase: string | null;
  campaignStatus: string | null;
  campaignId: string | null;
};

function formatA2pUsecase(value: string | null | undefined) {
  if (!value) return null;
  return value
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function a2pCampaignLabel(assignment: PhoneA2pAssignment | null | undefined): string | null {
  if (!assignment) return null;
  const service = assignment.messagingServiceName?.trim() || null;
  const usecase = formatA2pUsecase(assignment.campaignUsecase);
  if (service && usecase) return `${service} (${usecase})`;
  return service || usecase || assignment.messagingServiceSid;
}

/**
 * Map each IncomingPhoneNumber SID / E.164 to the Messaging Service (and A2P campaign)
 * it actually sits on in Twilio. Companies often use different campaigns, so this must
 * scan every service — not only the one saved in platform settings.
 */
export async function mapPhoneNumbersToA2pCampaigns(): Promise<{
  bySid: Map<string, PhoneA2pAssignment>;
  byE164: Map<string, PhoneA2pAssignment>;
  error: string | null;
}> {
  const bySid = new Map<string, PhoneA2pAssignment>();
  const byE164 = new Map<string, PhoneA2pAssignment>();
  let services: TwilioMessagingServiceOption[] = [];
  try {
    services = await listTwilioMessagingServices();
  } catch (err) {
    return {
      bySid,
      byE164,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const client = getTwilioClient();
  await Promise.all(
    services.map(async (service) => {
      const listed = await listMessagingServiceNumbers(service.sid);
      let campaignUsecase: string | null = null;
      let campaignStatus: string | null = null;
      let campaignId: string | null = null;
      try {
        const campaigns = await client.messaging.v1.services(service.sid).usAppToPerson.list({
          limit: 10,
        });
        const primary =
          campaigns.find((row) => /verified|approved/i.test(row.campaignStatus ?? "")) ??
          campaigns[0];
        if (primary) {
          campaignUsecase = primary.usAppToPersonUsecase ?? null;
          campaignStatus = primary.campaignStatus ?? null;
          campaignId = primary.campaignId ?? null;
        }
      } catch {
        /* Service may have no A2P campaign or the account may lack Compliance access. */
      }

      const assignment: PhoneA2pAssignment = {
        messagingServiceSid: service.sid,
        messagingServiceName: service.friendlyName,
        campaignUsecase,
        campaignStatus,
        campaignId,
      };
      for (const sid of listed.sids) bySid.set(sid, assignment);
      for (const e164 of listed.e164s) byE164.set(e164, assignment);
    })
  );

  return { bySid, byE164, error: null };
}

export type A2pNumberStatus = {
  id: string;
  e164: string;
  companyId: string;
  companyName: string;
  isPrimary: boolean;
  twilioSid: string | null;
  assignmentLocked: boolean;
  /** True if this number is on the Messaging Service saved in platform settings. */
  onMessagingService: boolean;
  /** True if this number is on this company's assigned campaign (or shared fallback). */
  onCompanyCampaign: boolean;
  /** Twilio Messaging Service / A2P campaign this number actually sits on. */
  messagingServiceSid: string | null;
  messagingServiceName: string | null;
  campaignLabel: string | null;
  campaignUsecase: string | null;
  campaignStatus: string | null;
  campaignId: string | null;
};

export type A2pSyncResult = {
  messagingServiceSid: string;
  companyIds: string[];
  attempted: number;
  attached: number;
  alreadyAttached: number;
  failed: Array<{ e164: string; companyId: string; error: string }>;
};

export async function companiesHaveA2pCampaign(companyIds: string[]): Promise<boolean> {
  if (await isA2pMessagingConfigured()) return true;
  if (!companyIds.length) return false;
  const count = await prisma.company.count({
    where: {
      id: { in: companyIds },
      a2pMessagingServiceSid: { not: null },
    },
  });
  return count > 0;
}

/**
 * Attach every unlocked Twilio-linked CRM phone number to that company's A2P campaign
 * (or the shared fallback when the company has no campaign of its own).
 */
export async function syncCompaniesNumbersToA2p(
  companyIds: string[]
): Promise<A2pSyncResult> {
  const sharedSid = await getSharedMessagingServiceSid();
  const companies = await prisma.company.findMany({
    where: { id: { in: companyIds } },
    select: { id: true, a2pMessagingServiceSid: true },
  });
  const sidByCompany = new Map(
    companies.map((c) => [c.id, c.a2pMessagingServiceSid?.trim() || sharedSid || null])
  );
  const uniqueSids = [
    ...new Set([...sidByCompany.values()].filter((sid): sid is string => Boolean(sid))),
  ];
  if (!uniqueSids.length) {
    throw new Error(
      "No Messaging Service selected. Open Settings → Phone numbers → A2P campaign and choose one per company."
    );
  }

  const { ensureMessagingServiceInboundWebhook, configureNumberWebhooks } = await import(
    "@/lib/twilio/numbers"
  );
  for (const sid of uniqueSids) {
    const webhook = await ensureMessagingServiceInboundWebhook(sid);
    if (!webhook.ok) {
      console.warn("[a2p] sync: could not set messaging service inbound webhook", sid, webhook.error);
    }
  }

  const numbers = await prisma.phoneNumber.findMany({
    where: {
      companyId: { in: companyIds },
      twilioSid: { not: null },
    },
    select: { e164: true, twilioSid: true, companyId: true, assignmentLocked: true },
  });

  let attached = 0;
  let alreadyAttached = 0;
  const failed: A2pSyncResult["failed"] = [];

  async function attachRow(row: {
    e164: string;
    twilioSid: string | null;
    companyId: string;
    assignmentLocked?: boolean;
  }) {
    if (!row.twilioSid) return;
    if (row.assignmentLocked) return;
    const targetSid = sidByCompany.get(row.companyId);
    if (!targetSid) {
      failed.push({
        e164: row.e164,
        companyId: row.companyId,
        error: "This company has no A2P campaign assigned.",
      });
      return;
    }
    try {
      await configureNumberWebhooks(row.twilioSid);
    } catch (err) {
      console.warn("[a2p] sync: configure number webhooks failed", row.e164, err);
    }
    const result = await attachNumberToA2pMessagingService(row.twilioSid, {
      companyId: row.companyId,
      messagingServiceSid: targetSid,
    });
    if (result.ok) {
      if (result.alreadyAttached) alreadyAttached += 1;
      else attached += 1;
    } else {
      failed.push({ e164: row.e164, companyId: row.companyId, error: result.error });
    }
  }

  for (const row of numbers) {
    await attachRow(row);
  }

  const missingSid = await prisma.phoneNumber.findMany({
    where: {
      companyId: { in: companyIds },
      twilioSid: null,
      assignmentLocked: false,
    },
    select: { id: true, e164: true, companyId: true, assignmentLocked: true },
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
        await attachRow({ ...row, twilioSid: sid });
      }
    } catch (err) {
      console.error("[a2p] resolve missing SIDs failed", err);
    }
  }

  return {
    messagingServiceSid: sharedSid ?? uniqueSids[0] ?? "",
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
      a2pMessagingServiceSid: true,
      phoneNumbers: {
        select: {
          id: true,
          e164: true,
          twilioSid: true,
          isPrimary: true,
          assignmentLocked: true,
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

  const assignments = await mapPhoneNumbersToA2pCampaigns();

  function assignmentForNumber(n: { twilioSid: string | null; e164: string }) {
    const normalized = normalizePhone(n.e164);
    const digitKey = phoneDigitsKey(n.e164);
    if (n.twilioSid && assignments.bySid.has(n.twilioSid)) {
      return assignments.bySid.get(n.twilioSid) ?? null;
    }
    return (
      assignments.byE164.get(normalized) ??
      (digitKey ? assignments.byE164.get(digitKey) ?? null : null)
    );
  }

  const numbers: A2pNumberStatus[] = [];
  for (const company of companies) {
    const companyCampaignSid =
      company.a2pMessagingServiceSid?.trim() || messagingServiceSid || null;
    for (const n of company.phoneNumbers) {
      const normalized = normalizePhone(n.e164);
      const digitKey = phoneDigitsKey(n.e164);
      const onMessagingService = Boolean(
        (n.twilioSid && listed.sids.has(n.twilioSid)) ||
          listed.e164s.has(normalized) ||
          (digitKey && listed.e164s.has(digitKey))
      );
      const assignment = assignmentForNumber(n);
      const onCompanyCampaign = Boolean(
        companyCampaignSid && assignment?.messagingServiceSid === companyCampaignSid
      );
      numbers.push({
        id: n.id,
        e164: n.e164,
        companyId: company.id,
        companyName: company.name,
        isPrimary: n.isPrimary || company.twilioPhone === n.e164,
        twilioSid: n.twilioSid,
        assignmentLocked: n.assignmentLocked,
        onMessagingService,
        onCompanyCampaign,
        messagingServiceSid: assignment?.messagingServiceSid ?? null,
        messagingServiceName: assignment?.messagingServiceName ?? null,
        campaignLabel: a2pCampaignLabel(assignment),
        campaignUsecase: assignment?.campaignUsecase ?? null,
        campaignStatus: assignment?.campaignStatus ?? null,
        campaignId: assignment?.campaignId ?? null,
      });
    }
  }

  const missing = numbers.filter((n) => n.twilioSid && !n.onCompanyCampaign);
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
      a2pMessagingServiceSid: c.a2pMessagingServiceSid,
    })),
    numbers,
    twilioLinkedCount: numbers.filter((n) => n.twilioSid).length,
    missingOnServiceCount: missing.length,
    missingPrimaryCount: missingPrimary.length,
  };
}
