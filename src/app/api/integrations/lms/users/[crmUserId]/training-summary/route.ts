import { NextRequest, NextResponse } from "next/server";
import { forbiddenForFieldRole, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { fetchLmsTrainingSummary } from "@/lib/integrations/lms-sync";

type Params = { params: Promise<{ crmUserId: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const fieldDenied = forbiddenForFieldRole(user.role); if (fieldDenied) return fieldDenied;

    const { crmUserId } = await params;
    const summary = await fetchLmsTrainingSummary(crmUserId);
    return NextResponse.json(summary);
  } catch {
    return unauthorizedResponse();
  }
}
