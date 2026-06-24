import { NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canViewSocialMarketing } from "@/lib/marketing/social-permissions";
import { getMetaSocialDashboard } from "@/lib/meta/sync";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canViewSocialMarketing(user.role)) return forbiddenResponse();

    const forceSync =
      request.nextUrl.searchParams.get("sync") === "1" ||
      request.nextUrl.searchParams.get("refresh") === "1";

    const dashboard = await getMetaSocialDashboard(user.companyId, { forceSync });

    return NextResponse.json(dashboard);
  } catch {
    return unauthorizedResponse();
  }
}
