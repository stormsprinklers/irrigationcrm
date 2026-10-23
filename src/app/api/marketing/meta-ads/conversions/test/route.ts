import { randomUUID } from "node:crypto";
import { SalesPipelineStage } from "@prisma/client";
import { NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { canManageCustomers } from "@/lib/customers/permissions";
import { sendMetaPipelineEvent } from "@/lib/meta/conversions-api";
import { prisma } from "@/lib/prisma";

export async function POST() {
  try {
    const user = await requireSessionUser();
    if (!canManageCustomers(user.role)) return forbiddenResponse();

    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: {
        metaConversionsAccessToken: true,
        metaConversionsDatasetId: true,
        metaConversionsTestEventCode: true,
      },
    });
    if (!company?.metaConversionsAccessToken || !company.metaConversionsDatasetId) {
      return badRequestResponse("Meta Conversions API is not configured");
    }
    if (!company.metaConversionsTestEventCode) {
      return badRequestResponse("Save the current Meta test event code first");
    }

    const result = await sendMetaPipelineEvent({
      accessToken: company.metaConversionsAccessToken,
      datasetId: company.metaConversionsDatasetId,
      testEventCode: company.metaConversionsTestEventCode,
      event: {
        id: `diagnostic-${randomUUID()}`,
        customerId: `diagnostic-${user.companyId}`,
        stage: SalesPipelineStage.LEAD,
        occurredAt: new Date(),
        value: null,
        currency: "USD",
        emailSha256: null,
        phoneSha256: null,
        gclid: null,
        gbraid: null,
        wbraid: null,
        fbc: null,
        fbp: null,
        metaLeadId: null,
        userAgent: null,
      },
    });

    return NextResponse.json({
      ok: true,
      requestId: result.requestId,
      metadata: result.metadata,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Meta test event failed" },
      { status: 502 }
    );
  }
}
