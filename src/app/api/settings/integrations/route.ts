import { NextRequest, NextResponse } from "next/server";
import { IntegrationType } from "@prisma/client";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { generateIntegrationKey } from "@/lib/integrations/keys";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN") return forbiddenResponse();

    const credentials = await prisma.integrationCredential.findMany({
      where: { companyId: user.companyId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        type: true,
        label: true,
        keyPrefix: true,
        enabled: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      credentials,
      urls: {
        crm: process.env.NEXT_PUBLIC_APP_URL ?? "",
        lms: process.env.NEXT_PUBLIC_LMS_URL ?? "",
        design: process.env.NEXT_PUBLIC_DESIGN_URL ?? "",
        website: process.env.NEXT_PUBLIC_WEBSITE_URL ?? "",
      },
    });
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN") return forbiddenResponse();

    const body = await request.json();
    const type = body.type as IntegrationType;
    const label = String(body.label ?? "").trim() || "Default";

    if (!Object.values(IntegrationType).includes(type)) {
      return badRequestResponse("Invalid integration type");
    }

    const { rawKey, keyHash, keyPrefix } = generateIntegrationKey();

    const credential = await prisma.integrationCredential.create({
      data: {
        companyId: user.companyId,
        type,
        label,
        keyHash,
        keyPrefix,
      },
      select: {
        id: true,
        type: true,
        label: true,
        keyPrefix: true,
        enabled: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ credential, rawKey }, { status: 201 });
  } catch {
    return unauthorizedResponse();
  }
}
