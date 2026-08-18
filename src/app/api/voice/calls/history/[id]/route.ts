import { NextResponse } from "next/server";
import {
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { getCallHistoryDetail } from "@/lib/voice/call-history-queries";
import { backfillCallLogEmployees } from "@/lib/voice/backfill-call-employees";
import {
  canAccessFieldCustomerComms,
  FIELD_CUSTOMER_COMMS_FORBIDDEN,
} from "@/lib/field/access";

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
    if (!(await canAccessFieldCustomerComms(user, call.customer?.id))) {
      return forbiddenResponse(FIELD_CUSTOMER_COMMS_FORBIDDEN);
    }
    return NextResponse.json(call);
  } catch {
    return unauthorizedResponse();
  }
}
