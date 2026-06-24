import { NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canManageCustomers } from "@/lib/customers/permissions";
import { getMetaSocialDashboard } from "@/lib/meta/sync";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canManageCustomers(user.role)) return forbiddenResponse();

    const forceSync =
      request.nextUrl.searchParams.get("sync") === "1" ||
      request.nextUrl.searchParams.get("refresh") === "1";

    const dashboard = await getMetaSocialDashboard(user.companyId, { forceSync });

    return NextResponse.json(dashboard);
  } catch {
    return unauthorizedResponse();
  }
}
