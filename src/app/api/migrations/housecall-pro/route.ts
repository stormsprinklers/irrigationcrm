import { NextResponse } from "next/server";
import { HousecallProMigrationStepType } from "@prisma/client";
import {
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import {
  getLatestMigration,
  isApiKeyConfigured,
  requireAdmin,
} from "@/lib/housecall-pro/orchestrator";

export async function GET() {
  try {
    const user = await requireSessionUser();
    requireAdmin(user.role);

    const migration = await getLatestMigration(user.companyId);
    return NextResponse.json({
      configured: isApiKeyConfigured(),
      migration,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Admin access required") {
      return forbiddenResponse();
    }
    return unauthorizedResponse();
  }
}
