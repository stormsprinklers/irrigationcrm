import { NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { fetchLmsTrainingSummary } from "@/lib/integrations/lms-sync";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (user.role === "TECH") return forbiddenResponse();

    const { id } = await params;
    const summary = await fetchLmsTrainingSummary(id);
    return NextResponse.json(summary);
  } catch {
    return unauthorizedResponse();
  }
}
