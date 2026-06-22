import { NextRequest, NextResponse } from "next/server";
import { HousecallProMigrationStepType } from "@prisma/client";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import {
  processMigrationBatch,
  requireAdmin,
} from "@/lib/housecall-pro/orchestrator";

type Params = { params: Promise<{ step: string }> };

function parseStep(step: string): HousecallProMigrationStepType | null {
  if ((Object.values(HousecallProMigrationStepType) as string[]).includes(step)) {
    return step as HousecallProMigrationStepType;
  }
  return null;
}

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    requireAdmin(user.role);
    const { step: stepParam } = await params;
    const step = parseStep(stepParam);
    if (!step) return badRequestResponse("Invalid step");

    const result = await processMigrationBatch({
      companyId: user.companyId,
      adminUserId: user.id,
      step,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof Error && err.message === "Admin access required") {
      return forbiddenResponse();
    }
    const message = err instanceof Error ? err.message : "Batch failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
