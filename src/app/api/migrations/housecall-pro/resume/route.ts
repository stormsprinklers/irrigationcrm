import { NextResponse } from "next/server";
import {
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { requireAdmin, resumeMigration } from "@/lib/housecall-pro/orchestrator";

export async function POST() {
  try {
    const user = await requireSessionUser();
    requireAdmin(user.role);
    const migration = await resumeMigration(user.companyId);
    return NextResponse.json({ migration });
  } catch (err) {
    if (err instanceof Error && err.message === "Admin access required") {
      return forbiddenResponse();
    }
    const message = err instanceof Error ? err.message : "Failed to resume migration";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
