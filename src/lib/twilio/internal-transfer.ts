import { PhoneNumberType } from "@prisma/client";
import { getTwilioClient } from "@/lib/inbox/twilio";
import { normalizePhone, phoneDigitsKey } from "@/lib/inbox/phone";
import { prisma } from "@/lib/prisma";
import { attachNumberToA2pMessagingService } from "@/lib/twilio/a2p";
import { configureNumberWebhooks } from "@/lib/twilio/numbers";
import { setExclusivePrimaryNumber } from "@/lib/twilio/primary-number";
import { syncCompanyTwilioPhone } from "@/lib/voice/company-phone";

/** Twilio Portability reasons that mean the number is already on Twilio (not a carrier port). */
export const TWILIO_OWNED_PORTABILITY_REASONS = new Set([
  "ALREADY_IN_THE_TARGET_ACCOUNT",
  "ALREADY_IN_ONE_OF_YOUR_TWILIO_ACCOUNTS",
  "ALREADY_IN_TWILIO_DIFFERENT_OWNER",
]);

export type TwilioOwnedKind =
  | "already_on_account"
  | "in_account_hierarchy"
  | "different_twilio_owner"
  | null;

export function classifyTwilioOwnedReason(
  reason: string | null | undefined
): TwilioOwnedKind {
  const key = (reason ?? "").trim().toUpperCase();
  if (!key) return null;
  if (key === "ALREADY_IN_THE_TARGET_ACCOUNT") return "already_on_account";
  if (key === "ALREADY_IN_ONE_OF_YOUR_TWILIO_ACCOUNTS") return "in_account_hierarchy";
  if (key === "ALREADY_IN_TWILIO_DIFFERENT_OWNER") return "different_twilio_owner";
  if (TWILIO_OWNED_PORTABILITY_REASONS.has(key)) return "different_twilio_owner";
  return null;
}

export function isTwilioOwnedPortabilityReason(reason: string | null | undefined) {
  return classifyTwilioOwnedReason(reason) != null;
}

export type FoundTwilioNumber = {
  sid: string;
  e164: string;
  friendlyName: string | null;
  accountSid: string;
  smsEnabled: boolean;
  voiceEnabled: boolean;
};

function matchesE164(a: string, b: string) {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  if (na === nb) return true;
  const ka = phoneDigitsKey(a);
  const kb = phoneDigitsKey(b);
  return Boolean(ka && kb && ka === kb);
}

/** Find an IncomingPhoneNumber on the configured account or its subaccounts. */
export async function findNumberInTwilioHierarchy(
  e164: string
): Promise<FoundTwilioNumber | null> {
  const client = getTwilioClient();
  const target = normalizePhone(e164);
  const mainSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  if (!mainSid) return null;

  async function searchOnAccount(accountSid: string): Promise<FoundTwilioNumber | null> {
    try {
      const rows = await client.api.v2010
        .accounts(accountSid)
        .incomingPhoneNumbers.list({ phoneNumber: target, limit: 20 });
      const match =
        rows.find((n) => matchesE164(n.phoneNumber, target)) ?? rows[0] ?? null;
      if (!match) return null;
      return {
        sid: match.sid,
        e164: normalizePhone(match.phoneNumber),
        friendlyName: match.friendlyName ?? null,
        accountSid: match.accountSid || accountSid,
        smsEnabled: Boolean(match.capabilities?.sms),
        voiceEnabled: Boolean(match.capabilities?.voice),
      };
    } catch (err) {
      console.error("[twilio-transfer] list numbers failed", accountSid, err);
      return null;
    }
  }

  const onMain = await searchOnAccount(mainSid);
  if (onMain) return onMain;

  try {
    const accounts = await client.api.v2010.accounts.list({
      status: "active",
      limit: 100,
    });
    for (const account of accounts) {
      if (account.sid === mainSid) continue;
      const found = await searchOnAccount(account.sid);
      if (found) return found;
    }
  } catch (err) {
    console.error("[twilio-transfer] list subaccounts failed", err);
  }

  return null;
}

/**
 * Move a number onto the CRM Twilio account when it lives on a related subaccount.
 * No-op when already on the target account.
 */
export async function ensureNumberOnCrmTwilioAccount(
  found: FoundTwilioNumber
): Promise<FoundTwilioNumber> {
  const targetAccountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  if (!targetAccountSid) {
    throw new Error("TWILIO_ACCOUNT_SID is not configured");
  }
  if (found.accountSid === targetAccountSid) {
    return found;
  }

  const client = getTwilioClient();
  try {
    const updated = await client.api.v2010
      .accounts(found.accountSid)
      .incomingPhoneNumbers(found.sid)
      .update({ accountSid: targetAccountSid });
    return {
      sid: updated.sid,
      e164: normalizePhone(updated.phoneNumber || found.e164),
      friendlyName: updated.friendlyName ?? found.friendlyName,
      accountSid: updated.accountSid || targetAccountSid,
      smsEnabled: Boolean(updated.capabilities?.sms ?? found.smsEnabled),
      voiceEnabled: Boolean(updated.capabilities?.voice ?? found.voiceEnabled),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Could not transfer ${found.e164} from Twilio account ${found.accountSid} to ${targetAccountSid}: ${message}`
    );
  }
}

export type ImportTwilioNumberResult = {
  e164: string;
  phoneNumberId: string;
  twilioSid: string;
  transferredFromAccountSid: string | null;
  movedFromCompanyId: string | null;
  created: boolean;
};

/**
 * Bring Twilio-owned numbers into the current CRM company: transfer within the
 * Twilio account hierarchy if needed, configure webhooks + A2P, create/update PhoneNumber.
 */
export async function importTwilioNumbersToCompany(
  companyId: string,
  e164s: string[]
): Promise<{ imported: ImportTwilioNumberResult[]; failed: Array<{ e164: string; error: string }> }> {
  const imported: ImportTwilioNumberResult[] = [];
  const failed: Array<{ e164: string; error: string }> = [];

  const unique = [...new Set(e164s.map((e) => normalizePhone(e)).filter(Boolean))];

  for (const e164 of unique) {
    try {
      let found = await findNumberInTwilioHierarchy(e164);
      if (!found) {
        failed.push({
          e164,
          error:
            "Number is on Twilio but not on this account (or its subaccounts). Ask Twilio Support to transfer it, or use Console.",
        });
        continue;
      }

      const sourceAccountSid =
        found.accountSid === process.env.TWILIO_ACCOUNT_SID?.trim()
          ? null
          : found.accountSid;
      found = await ensureNumberOnCrmTwilioAccount(found);

      try {
        await configureNumberWebhooks(found.sid);
      } catch (err) {
        console.error("[twilio-transfer] webhook config failed", found.sid, err);
      }
      try {
        const a2p = await attachNumberToA2pMessagingService(found.sid);
        if (!a2p.ok) {
          console.warn("[twilio-transfer] A2P attach failed", found.sid, a2p.error);
        }
      } catch (err) {
        console.error("[twilio-transfer] A2P attach error", found.sid, err);
      }

      // If another CRM company already owns this e164, move it here.
      const elsewhere = await prisma.phoneNumber.findFirst({
        where: {
          e164: found.e164,
          companyId: { not: companyId },
          twilioSid: found.sid,
        },
      });
      let movedFromCompanyId: string | null = null;
      if (elsewhere) {
        const wasPrimary = elsewhere.isPrimary;
        const fromCompanyId = elsewhere.companyId;
        await prisma.phoneNumber.delete({ where: { id: elsewhere.id } });
        movedFromCompanyId = fromCompanyId;
        if (wasPrimary) {
          const nextPrimary = await prisma.phoneNumber.findFirst({
            where: { companyId: fromCompanyId },
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          });
          if (nextPrimary) {
            await setExclusivePrimaryNumber({
              companyId: fromCompanyId,
              numberId: nextPrimary.id,
            });
            await syncCompanyTwilioPhone(fromCompanyId, nextPrimary.e164).catch(
              () => undefined
            );
          } else {
            await prisma.company
              .update({
                where: { id: fromCompanyId },
                data: { twilioPhone: null },
              })
              .catch(() => undefined);
          }
        }
      }

      const existing = await prisma.phoneNumber.findFirst({
        where: { companyId, e164: found.e164 },
      });

      const primaryCount = await prisma.phoneNumber.count({
        where: { companyId, isPrimary: true },
      });
      const makePrimary = primaryCount === 0;

      const phone = existing
        ? await prisma.phoneNumber.update({
            where: { id: existing.id },
            data: {
              twilioSid: found.sid,
              friendlyName: existing.friendlyName ?? found.friendlyName,
              smsEnabled: found.smsEnabled,
              voiceEnabled: found.voiceEnabled,
            },
          })
        : await prisma.phoneNumber.create({
            data: {
              companyId,
              e164: found.e164,
              friendlyName: found.friendlyName,
              twilioSid: found.sid,
              numberType: PhoneNumberType.TRACKING,
              isPrimary: false,
              smsEnabled: found.smsEnabled,
              voiceEnabled: found.voiceEnabled,
            },
          });

      if (makePrimary) {
        await setExclusivePrimaryNumber({
          companyId,
          numberId: phone.id,
        });
        await syncCompanyTwilioPhone(companyId, found.e164).catch(() => undefined);
      }

      imported.push({
        e164: found.e164,
        phoneNumberId: phone.id,
        twilioSid: found.sid,
        transferredFromAccountSid: sourceAccountSid,
        movedFromCompanyId,
        created: !existing,
      });
    } catch (err) {
      failed.push({
        e164,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { imported, failed };
}

/** Human-readable copy for the port wizard when Twilio already owns the number. */
export function describeTwilioOwnedSituation(params: {
  kind: TwilioOwnedKind;
  canImport: boolean;
  crmCompanyName?: string | null;
}): string {
  if (params.canImport) {
    if (params.crmCompanyName) {
      return `Already on Twilio (currently linked to ${params.crmCompanyName}). Will transfer into this company — no carrier port needed.`;
    }
    return "Already on your Twilio account. Will import into this company — no carrier port, LOA, or utility bill needed.";
  }
  if (params.kind === "different_twilio_owner") {
    return "This number is on a different Twilio account you don't control. Twilio Support must transfer it before you can use it here.";
  }
  if (params.kind === "in_account_hierarchy") {
    return "Twilio reports this number on one of your accounts, but it could not be found automatically. Check Twilio Console or contact Support.";
  }
  return "This number is already on Twilio and cannot be ported via the carrier Port-In API.";
}
