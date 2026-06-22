import { NextRequest, NextResponse } from "next/server";
import { TimeOffStatus } from "@prisma/client";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canReviewTimeOff, listTimeOffRequests } from "@/lib/schedule/time-off";

export async function GET(_request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canReviewTimeOff(user.role)) return forbiddenResponse();

    const requests = await listTimeOffRequests(user.companyId, {
      status: TimeOffStatus.PENDING,
    });

    return NextResponse.json({ requests });
  } catch {
    return unauthorizedResponse();
  }
}
