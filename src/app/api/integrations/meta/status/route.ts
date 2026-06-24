import { NextResponse } from "next/server";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canManageCustomers } from "@/lib/customers/permissions";
import { getMetaIntegrationStatus } from "@/lib/meta/status";

export async function GET() {
  try {
    const user = await requireSessionUser();
    if (!canManageCustomers(user.role)) return forbiddenResponse();

    const status = await getMetaIntegrationStatus(user.companyId);
    return NextResponse.json(status);
  } catch {
    return unauthorizedResponse();
  }
}
