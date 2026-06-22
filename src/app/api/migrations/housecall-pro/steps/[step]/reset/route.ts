import { NextRequest, NextResponse } from "next/server";
import { HousecallProMigrationStepType } from "@prisma/client";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { requireAdmin, resetMigrationStep } from "@/lib/housecall-pro/orchestrator";

type Params = { params: Promise<{ step: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    requireAdmin(user.role);
    const { step: stepParam } = await params;
    if (!(Object.values(HousecallProMigrationStepType) as string[]).includes(stepParam)) {
      return badRequestResponse("Invalid step");
    }
    const migration = await resetMigrationStep(
      user.companyId,
      stepParam as HousecallProMigrationStepType
    );
    return NextResponse.json({ migration });
  } catch (err) {
    if (err instanceof Error && err.message === "Admin access required") {
      return forbiddenResponse();
    }
    const message = err instanceof Error ? err.message : "Failed to reset step";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
