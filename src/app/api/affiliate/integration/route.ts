import { IntegrationType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import {
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { getAffiliateCredentialSummary } from "@/lib/affiliate/customers";
import { generateIntegrationKey } from "@/lib/integrations/keys";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser(request);
    if (user.role !== "AFFILIATE") return forbiddenResponse();
    const credentials = await getAffiliateCredentialSummary(user.id, user.companyId);
    const importedCustomers = await prisma.customer.count({
      where: { companyId: user.companyId, affiliateUserId: user.id },
    });
    return NextResponse.json({
      credentials,
      importedCustomers,
      endpoint: new URL("/api/public/affiliate/customers", request.url).toString(),
    });
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser(request);
    if (user.role !== "AFFILIATE") return forbiddenResponse();
    const body = await request.json().catch(() => ({}));
    const label = String(body.label ?? "Customer import").trim().slice(0, 120) || "Customer import";
    const { rawKey, keyHash, keyPrefix } = generateIntegrationKey();

    const credential = await prisma.$transaction(async (tx) => {
      await tx.integrationCredential.updateMany({
        where: {
          companyId: user.companyId,
          ownerUserId: user.id,
          type: IntegrationType.AFFILIATE,
          enabled: true,
        },
        data: { enabled: false },
      });
      return tx.integrationCredential.create({
        data: {
          companyId: user.companyId,
          ownerUserId: user.id,
          type: IntegrationType.AFFILIATE,
          label,
          keyHash,
          keyPrefix,
        },
        select: {
          id: true,
          label: true,
          keyPrefix: true,
          enabled: true,
          createdAt: true,
        },
      });
    });

    return NextResponse.json({ credential, rawKey }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return unauthorizedResponse();
    return NextResponse.json({ error: "Could not generate API key" }, { status: 500 });
  }
}
