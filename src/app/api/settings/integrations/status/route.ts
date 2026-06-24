import { NextResponse } from "next/server";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getIntegrationStatuses } from "@/lib/integrations/status";

export async function GET() {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN") return forbiddenResponse();

    const statuses = await getIntegrationStatuses(user.companyId);
    return NextResponse.json({ statuses });
  } catch {
    return unauthorizedResponse();
  }
}
