import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import {
  isApiKeyConfigured,
  requireAdmin,
  startMigration,
} from "@/lib/housecall-pro/orchestrator";

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    requireAdmin(user.role);
    if (!isApiKeyConfigured()) {
      return badRequestResponse("HOUSECALL_PRO_API_KEY is not configured");
    }

    const body = await request.json().catch(() => ({}));
    const debugMode = Boolean(body?.debugMode);

    const migration = await startMigration(user.companyId, { debugMode });
    return NextResponse.json({ migration });
  } catch (err) {
    if (err instanceof Error && err.message === "Admin access required") {
      return forbiddenResponse();
    }
    const message = err instanceof Error ? err.message : "Failed to start migration";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
