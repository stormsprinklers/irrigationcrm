import { NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import {
  isApiKeyConfigured,
  refreshPreview,
  requireAdmin,
} from "@/lib/housecall-pro/orchestrator";

export async function GET() {
  try {
    const user = await requireSessionUser();
    requireAdmin(user.role);
    if (!isApiKeyConfigured()) {
      return badRequestResponse("HOUSECALL_PRO_API_KEY is not configured");
    }
    const preview = await refreshPreview(user.companyId);
    return NextResponse.json({ preview });
  } catch (err) {
    if (err instanceof Error && err.message === "Admin access required") {
      return forbiddenResponse();
    }
    const message = err instanceof Error ? err.message : "Failed to refresh preview";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
