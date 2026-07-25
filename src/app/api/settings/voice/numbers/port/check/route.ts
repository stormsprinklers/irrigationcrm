import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { normalizePhone } from "@/lib/inbox/contacts";
import {
  checkPortability,
  isTollFreeNumberType,
  isUsLocalE164,
  pinRequiredForPort,
} from "@/lib/twilio/porting";

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

    const result = await checkPortability(e164);
    const tollFree = isTollFreeNumberType(result.numberType);
    const manualOnly =
      !result.portable &&
      (result.notPortableReason ?? "")
        .toUpperCase()
        .includes("MANUAL");

    return NextResponse.json({
      e164: result.phoneNumber || e164,
      portable: result.portable && !tollFree,
      pinRequired: pinRequiredForPort(
        result.pinAndAccountNumberRequired,
        result.numberType
      ),
      numberType: result.numberType,
      country: result.country,
      notPortableReason: result.notPortableReason,
      notPortableReasonCode: result.notPortableReasonCode,
      blockedReason: tollFree
        ? "Toll-free numbers cannot be ported through this API. Use Twilio Console or contact Twilio Support."
        : !result.portable
          ? result.notPortableReason ||
            (manualOnly
              ? "This number may require manual porting via Twilio Support."
              : "This number is not portable to Twilio via the automated Porting API.")
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
