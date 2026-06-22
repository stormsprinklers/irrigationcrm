import { NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getCallHistoryDetail } from "@/lib/voice/call-history-queries";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const call = await getCallHistoryDetail(user.companyId, id);
    if (!call) {
      return NextResponse.json({ error: "Call not found" }, { status: 404 });
    }
    return NextResponse.json(call);
  } catch {
    return unauthorizedResponse();
  }
}
