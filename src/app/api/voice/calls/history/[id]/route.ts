import { NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getCallHistoryDetail } from "@/lib/voice/call-history-queries";
import { backfillCallLogEmployees } from "@/lib/voice/backfill-call-employees";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    await backfillCallLogEmployees({ companyId: user.companyId, take: 50 }).catch(() => {});
    const call = await getCallHistoryDetail(user.companyId, id);
    if (!call) {
      return NextResponse.json({ error: "Call not found" }, { status: 404 });
    }
    return NextResponse.json(call);
  } catch {
    return unauthorizedResponse();
  }
}
