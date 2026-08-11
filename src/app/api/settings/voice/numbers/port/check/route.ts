import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { normalizePhone } from "@/lib/inbox/contacts";
import { prisma } from "@/lib/prisma";
import {
  checkPortability,
  isTollFreeNumberType,
  isUsLocalE164,
  pinRequiredForPort,
} from "@/lib/twilio/porting";
import {
  classifyTwilioOwnedReason,
  describeTwilioOwnedSituation,
  findNumberInTwilioHierarchy,
  isTwilioOwnedPortabilityReason,
} from "@/lib/twilio/internal-transfer";

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const raw = String(body.e164 ?? body.phoneNumber ?? "").trim();
    if (!raw) {
      return NextResponse.json({ error: "Phone number required" }, { status: 400 });
    }

    const e164 = normalizePhone(raw);
    if (!isUsLocalE164(e164)) {
      return NextResponse.json(
        {
          error:
            "Only US numbers (+1) are supported in this wizard. Toll-free and international ports must use Twilio Console.",
          e164,
        },
        { status: 400 }
      );
    }

    // Proactively detect numbers already on this Twilio account / subaccounts.
    const onTwilio = await findNumberInTwilioHierarchy(e164);

    let result: Awaited<ReturnType<typeof checkPortability>>;
    try {
      result = await checkPortability(e164);
    } catch (err) {
      // Some Twilio responses surface ALREADY_IN_* as HTTP errors — still treat as Twilio-owned.
      const message = err instanceof Error ? err.message : String(err);
      const bodyObj =
        err && typeof err === "object" && "body" in err
          ? (err as { body?: Record<string, unknown> }).body
          : null;
      const reasonFromBody =
        bodyObj && typeof bodyObj.not_portable_reason === "string"
          ? bodyObj.not_portable_reason
          : null;
      const codeFromBody =
        bodyObj && typeof bodyObj.not_portable_reason_code === "number"
          ? bodyObj.not_portable_reason_code
          : null;
      const inferredReason =
        reasonFromBody ||
        (isTwilioOwnedPortabilityReason(message) ? message : null) ||
        (onTwilio ? "ALREADY_IN_THE_TARGET_ACCOUNT" : null);

      if (inferredReason || onTwilio) {
        result = {
          phoneNumber: e164,
          portable: false,
          pinAndAccountNumberRequired: false,
          numberType: null,
          country: "US",
          notPortableReason: inferredReason ?? "ALREADY_IN_THE_TARGET_ACCOUNT",
          notPortableReasonCode: codeFromBody,
        };
      } else {
        throw err;
      }
    }

    const tollFree = isTollFreeNumberType(result.numberType);
    const twilioOwnedKind =
      classifyTwilioOwnedReason(result.notPortableReason) ||
      (onTwilio ? "already_on_account" : null);
    const alreadyOnTwilio = Boolean(onTwilio || twilioOwnedKind);
    const canImport = Boolean(onTwilio) && !tollFree;

    let crmCompanyName: string | null = null;
    if (onTwilio) {
      const linked = await prisma.phoneNumber.findFirst({
        where: {
          twilioSid: onTwilio.sid,
          companyId: { not: user.companyId },
        },
        include: { company: { select: { name: true } } },
      });
      crmCompanyName = linked?.company.name ?? null;
    }

    const alreadyHere = await prisma.phoneNumber.findFirst({
      where: { companyId: user.companyId, e164: onTwilio?.e164 ?? e164 },
      select: { id: true },
    });

    const manualOnly =
      !result.portable &&
      (result.notPortableReason ?? "").toUpperCase().includes("MANUAL");

    let blockedReason: string | null = null;
    if (tollFree) {
      blockedReason =
        "Toll-free numbers cannot be ported through this API. Use Twilio Console or contact Twilio Support.";
    } else if (alreadyOnTwilio) {
      if (alreadyHere && canImport) {
        blockedReason =
          "This number is already linked to this company. Open Phone numbers to manage it.";
      } else {
        blockedReason = describeTwilioOwnedSituation({
          kind: twilioOwnedKind,
          canImport,
          crmCompanyName,
        });
      }
    } else if (!result.portable) {
      blockedReason =
        result.notPortableReason ||
        (manualOnly
          ? "This number may require manual porting via Twilio Support."
          : "This number is not portable to Twilio via the automated Porting API.");
    }

    const portable = result.portable && !tollFree && !alreadyOnTwilio;
    // Allow wizard add when we can import/transfer even though not "portable".
    const allowedInWizard =
      portable || (canImport && !alreadyHere && !tollFree);

    return NextResponse.json({
      e164: result.phoneNumber || onTwilio?.e164 || e164,
      portable,
      allowedInWizard,
      alreadyOnTwilio,
      canImport: canImport && !alreadyHere,
      twilioOwnedKind,
      twilioSid: onTwilio?.sid ?? null,
      pinRequired: pinRequiredForPort(
        result.pinAndAccountNumberRequired,
        result.numberType
      ),
      numberType: result.numberType,
      country: result.country,
      notPortableReason: result.notPortableReason,
      notPortableReasonCode: result.notPortableReasonCode,
      blockedReason,
      message: alreadyOnTwilio
        ? describeTwilioOwnedSituation({
            kind: twilioOwnedKind,
            canImport: canImport && !alreadyHere,
            crmCompanyName,
          })
        : null,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message =
      error instanceof Error ? error.message : "Portability check failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
