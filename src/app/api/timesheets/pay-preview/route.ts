import { NextResponse } from "next/server";
import {
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { canViewAllTimesheets } from "@/lib/timesheets/permissions";
import { listPayPeriodSummaries } from "@/lib/timesheets/queries";

export async function GET() {
  try {
    const user = await requireSessionUser();
    if (!canViewAllTimesheets(user.role)) {
      return forbiddenResponse();
    }

    const data = await listPayPeriodSummaries(user.companyId);
    return NextResponse.json(data);
  } catch {
    return unauthorizedResponse();
  }
}
