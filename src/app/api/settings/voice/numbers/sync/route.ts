import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { syncAccountNumbers } from "@/lib/twilio/numbers";

export async function POST() {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!process.env.TWILIO_ACCOUNT_SID) {
      return NextResponse.json({ error: "Twilio not configured" }, { status: 503 });
    }

    const result = await syncAccountNumbers(user.companyId);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
