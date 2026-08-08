import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/api-auth";
import { searchAvailableNumbers } from "@/lib/twilio/numbers";
import {
  normalizeContainsPattern,
  vanityLettersToDigits,
} from "@/lib/twilio/vanity";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!process.env.TWILIO_ACCOUNT_SID) {
      return NextResponse.json({ error: "Twilio not configured" }, { status: 503 });
    }

    const { searchParams } = request.nextUrl;
    // Prefer areaCodes (comma-separated); fall back to single areaCode for older clients.
    const areaCodesParam =
      searchParams.get("areaCodes") ?? searchParams.get("areaCode") ?? "";
    const containsRaw = searchParams.get("contains") ?? "";
    const contains = normalizeContainsPattern(containsRaw);

    const numbers = await searchAvailableNumbers(areaCodesParam, contains);
    return NextResponse.json({
      numbers,
      query: {
        areaCodes: areaCodesParam
          .split(/[\s,]+/)
          .map((c) => c.replace(/\D/g, "").slice(0, 3))
          .filter((c) => c.length === 3),
        contains: contains ?? null,
        digitPreview: contains ? vanityLettersToDigits(contains) : null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
