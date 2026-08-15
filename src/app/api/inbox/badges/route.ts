import { NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getInboxBadgeCounts } from "@/lib/inbox/badge-counts";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const counts = await getInboxBadgeCounts(user.companyId);
    return NextResponse.json(counts);
  } catch {
    return unauthorizedResponse();
  }
}
