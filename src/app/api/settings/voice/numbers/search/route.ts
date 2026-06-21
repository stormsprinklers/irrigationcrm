import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { searchAvailableNumbers } from "@/lib/twilio/numbers";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const areaCode = request.nextUrl.searchParams.get("areaCode") ?? "801";
    const contains = request.nextUrl.searchParams.get("contains") ?? undefined;

    if (!process.env.TWILIO_ACCOUNT_SID) {
      return NextResponse.json({ error: "Twilio not configured" }, { status: 503 });
    }

    const numbers = await searchAvailableNumbers(areaCode, contains);
    return NextResponse.json({ numbers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
