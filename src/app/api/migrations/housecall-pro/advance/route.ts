import { NextResponse } from "next/server";
import {
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { advanceMigrationStep, requireAdmin } from "@/lib/housecall-pro/orchestrator";

export async function POST() {
  try {
    const user = await requireSessionUser();
    requireAdmin(user.role);
    const migration = await advanceMigrationStep(user.companyId);
    return NextResponse.json({ migration });
  } catch (err) {
    if (err instanceof Error && err.message === "Admin access required") {
      return forbiddenResponse();
    }
    const message = err instanceof Error ? err.message : "Failed to advance migration";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
