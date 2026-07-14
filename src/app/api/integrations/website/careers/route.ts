import { NextRequest, NextResponse } from "next/server";
import { IntegrationType } from "@prisma/client";
import { authenticateIntegration, isIntegrationContext } from "@/lib/integrations/auth";
import { logIntegrationAudit } from "@/lib/integrations/audit";
import { websiteCareersApplicationSchema } from "@/lib/integrations/schemas";
import { createApplicantFromCareers } from "@/lib/hiring/applicants";

export async function POST(request: NextRequest) {
  const auth = await authenticateIntegration(request, IntegrationType.WEBSITE);
  if (!isIntegrationContext(auth)) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = websiteCareersApplicationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const result = await createApplicantFromCareers(auth.companyId, parsed.data);
    await logIntegrationAudit({
      companyId: auth.companyId,
      integrationType: IntegrationType.WEBSITE,
      action: "website.careers.create",
      payload: { externalId: parsed.data.externalId },
      status: "success",
    });
    return NextResponse.json(
      {
        applicantId: result.applicant.id,
        created: result.created,
        stage: result.applicant.stage,
        aiScore: result.applicant.aiScore,
      },
      { status: result.created ? 201 : 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create applicant";
    await logIntegrationAudit({
      companyId: auth.companyId,
      integrationType: IntegrationType.WEBSITE,
      action: "website.careers.create",
      payload: body,
      status: "error",
      error: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
