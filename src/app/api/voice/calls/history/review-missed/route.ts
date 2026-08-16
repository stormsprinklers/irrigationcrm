import { NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { markRecentMissedCallsReviewed } from "@/lib/voice/call-history-queries";

export async function POST() {
  try {
    const user = await requireSessionUser();
    const cleared = await markRecentMissedCallsReviewed(user.companyId);
    return NextResponse.json({ ok: true, cleared });
  } catch {
    return unauthorizedResponse();
  }
}
