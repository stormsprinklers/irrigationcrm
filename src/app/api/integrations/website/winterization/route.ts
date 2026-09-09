import { NextRequest, NextResponse } from "next/server";
import { IntegrationType } from "@prisma/client";
import { authenticateIntegration, isIntegrationContext } from "@/lib/integrations/auth";
import { logIntegrationAudit } from "@/lib/integrations/audit";
import { websiteWinterizationSchema } from "@/lib/integrations/schemas";
import { createWinterizationRequest } from "@/lib/winterization/create";
import { irrigationFeaturesEnabled } from "@/lib/company/features";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const auth = await authenticateIntegration(request, IntegrationType.WEBSITE);
  if (!isIntegrationContext(auth)) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = websiteWinterizationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const company = await prisma.company.findUnique({
    where: { id: auth.companyId },
    select: { irrigationFeaturesEnabled: true },
  });
  if (!irrigationFeaturesEnabled(company)) {
    return NextResponse.json({ error: "Winterization tools are not enabled" }, { status: 403 });
  }

  try {
    const result = await createWinterizationRequest(auth.companyId, parsed.data);
    await logIntegrationAudit({
      companyId: auth.companyId,
      integrationType: IntegrationType.WEBSITE,
      action: "website.winterization.create",
      payload: { externalId: parsed.data.externalId },
      status: "success",
    });
    return NextResponse.json(
      { requestId: result.request.id, created: result.created },
      { status: result.created ? 201 : 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create winterization request";
    await logIntegrationAudit({
      companyId: auth.companyId,
      integrationType: IntegrationType.WEBSITE,
      action: "website.winterization.create",
      payload: body,
      status: "error",
      error: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
