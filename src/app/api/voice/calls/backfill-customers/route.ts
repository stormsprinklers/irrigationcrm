import { NextResponse } from "next/server";
import {
  requireSessionUser,
  unauthorizedResponse,
  forbiddenForFieldRole,
} from "@/lib/api-auth";
import { backfillCallLogCustomers } from "@/lib/voice/backfill-call-customers";

/** Link historical calls to customers by phone (null customerId only). */
export async function POST() {
  try {
    const user = await requireSessionUser();
    const fieldBlock = forbiddenForFieldRole(user.role);
    if (fieldBlock) return fieldBlock;

    const result = await backfillCallLogCustomers({
      companyId: user.companyId,
      take: 5000,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return unauthorizedResponse();
  }
}
