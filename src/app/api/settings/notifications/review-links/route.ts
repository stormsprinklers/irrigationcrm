import { NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getReviewLinkClickStats } from "@/lib/notifications/tracked-links";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const stats = await getReviewLinkClickStats(user.companyId);
    return NextResponse.json(stats);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message = error instanceof Error ? error.message : "Failed to load review link stats";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
