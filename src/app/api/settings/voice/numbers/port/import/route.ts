import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { normalizePhone } from "@/lib/inbox/contacts";
import { isUsLocalE164 } from "@/lib/twilio/porting";
import { importTwilioNumbersToCompany } from "@/lib/twilio/internal-transfer";

/**
 * Import / internally transfer Twilio-owned numbers into the current company.
 * Used by the port wizard when portability reports the number is already on Twilio.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const rawList = Array.isArray(body.e164s)
      ? body.e164s
      : body.e164
        ? [body.e164]
        : [];
    const e164s = rawList
      .map((v: unknown) => normalizePhone(String(v ?? "")))
      .filter((e: string) => Boolean(e));

    if (!e164s.length) {
      return NextResponse.json({ error: "At least one phone number is required" }, { status: 400 });
    }

    for (const e164 of e164s) {
      if (!isUsLocalE164(e164)) {
        return NextResponse.json(
          { error: `Only US +1 numbers are supported (${e164})` },
          { status: 400 }
        );
      }
    }

    const result = await importTwilioNumbersToCompany(user.companyId, e164s);
    if (!result.imported.length && result.failed.length) {
      return NextResponse.json(
        {
          error: result.failed[0]?.error ?? "Import failed",
          failed: result.failed,
          imported: result.imported,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message =
      error instanceof Error ? error.message : "Twilio number import failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
