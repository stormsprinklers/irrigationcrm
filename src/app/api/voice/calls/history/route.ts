import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { listCallHistory } from "@/lib/voice/call-history-queries";
import { CALL_HISTORY_UI_LIMIT } from "@/lib/voice/call-history";
import { backfillCallLogCustomers } from "@/lib/voice/backfill-call-customers";
import { backfillCallLogEmployees } from "@/lib/voice/backfill-call-employees";
import { fieldCustomerCommsWhere } from "@/lib/field/access";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    await backfillCallLogCustomers({ companyId: user.companyId, take: 300 }).catch(() => {});
    await backfillCallLogEmployees({ companyId: user.companyId, take: 300 }).catch(() => {});
    const commsWhere = await fieldCustomerCommsWhere(user);
    const search = request.nextUrl.searchParams.get("q")?.trim().slice(0, 100) ?? "";
    const calls = await listCallHistory(user.companyId, CALL_HISTORY_UI_LIMIT, {
      customerIds: commsWhere?.customerId.in,
      search,
    });
    return NextResponse.json({ calls, search });
  } catch {
    return unauthorizedResponse();
  }
}
