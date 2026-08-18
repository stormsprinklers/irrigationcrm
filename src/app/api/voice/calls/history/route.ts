import { NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { listCallHistory } from "@/lib/voice/call-history-queries";
import { CALL_HISTORY_UI_LIMIT } from "@/lib/voice/call-history";
import { backfillCallLogCustomers } from "@/lib/voice/backfill-call-customers";
import { backfillCallLogEmployees } from "@/lib/voice/backfill-call-employees";
import { fieldCustomerCommsWhere } from "@/lib/field/access";

export async function GET() {
  try {
    const user = await requireSessionUser();
    await backfillCallLogCustomers({ companyId: user.companyId, take: 300 }).catch(() => {});
    await backfillCallLogEmployees({ companyId: user.companyId, take: 300 }).catch(() => {});
    const commsWhere = await fieldCustomerCommsWhere(user);
    const calls = await listCallHistory(user.companyId, CALL_HISTORY_UI_LIMIT, {
      customerIds: commsWhere?.customerId.in,
    });
    return NextResponse.json({ calls });
  } catch {
    return unauthorizedResponse();
  }
}
