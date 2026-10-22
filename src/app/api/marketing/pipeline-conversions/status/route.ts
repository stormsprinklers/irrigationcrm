import { NextRequest, NextResponse } from "next/server";
import { PipelineConversionPlatform } from "@prisma/client";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { canManageCustomers } from "@/lib/customers/permissions";
import { requeueCompanyPipelineDeliveries } from "@/lib/marketing/pipeline-conversion-delivery";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireSessionUser();
    if (!canManageCustomers(user.role)) return forbiddenResponse();

    const [counts, recentFailures] = await Promise.all([
      prisma.pipelineConversionDelivery.groupBy({
        by: ["platform", "status"],
        where: { event: { companyId: user.companyId } },
        _count: { _all: true },
      }),
      prisma.pipelineConversionDelivery.findMany({
        where: {
          event: { companyId: user.companyId },
          status: "FAILED",
        },
        select: {
          id: true,
          platform: true,
          attempts: true,
          lastError: true,
          nextAttemptAt: true,
          event: { select: { stage: true, occurredAt: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 10,
      }),
    ]);

    return NextResponse.json({ counts, recentFailures });
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canManageCustomers(user.role)) return forbiddenResponse();
    const body = await request.json().catch(() => ({}));
    const platform = body.platform ? String(body.platform).toUpperCase() : undefined;
    if (platform && !Object.values(PipelineConversionPlatform).includes(platform as PipelineConversionPlatform)) {
      return badRequestResponse("platform must be GOOGLE or META");
    }
    const requeued = await requeueCompanyPipelineDeliveries(
      user.companyId,
      platform as PipelineConversionPlatform | undefined
    );
    return NextResponse.json({ ok: true, requeued });
  } catch {
    return unauthorizedResponse();
  }
}
