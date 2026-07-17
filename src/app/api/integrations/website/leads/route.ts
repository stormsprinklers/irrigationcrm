import { NextRequest, NextResponse } from "next/server";
import { IntegrationType } from "@prisma/client";
import { authenticateIntegration, isIntegrationContext } from "@/lib/integrations/auth";
import { logIntegrationAudit } from "@/lib/integrations/audit";
import { websiteLeadSchema } from "@/lib/integrations/schemas";
import { createLeadFromIntegration } from "@/lib/leads/create";

export async function POST(request: NextRequest) {
  const auth = await authenticateIntegration(request, IntegrationType.WEBSITE);
  if (!isIntegrationContext(auth)) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    await logIntegrationAudit({
      companyId: auth.companyId,
      integrationType: IntegrationType.WEBSITE,
      action: "website.leads.create",
      status: "error",
      error: "Invalid JSON",
    });
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = websiteLeadSchema.safeParse(body);
  if (!parsed.success) {
    const details = parsed.error.flatten();
    await logIntegrationAudit({
      companyId: auth.companyId,
      integrationType: IntegrationType.WEBSITE,
      action: "website.leads.create",
      payload: body,
      status: "error",
      error: `Validation failed: ${JSON.stringify(details.fieldErrors)}`,
    });
    return NextResponse.json(
      { error: "Validation failed", details },
      { status: 400 }
    );
  }

  try {
    const result = await createLeadFromIntegration(auth.companyId, parsed.data);
    await logIntegrationAudit({
      companyId: auth.companyId,
      integrationType: IntegrationType.WEBSITE,
      action: "website.leads.create",
      payload: {
        externalId: parsed.data.externalId,
        created: result.created,
        updated: result.updated,
        source: parsed.data.source ?? "website",
        hasPhone: Boolean(parsed.data.phone?.trim()),
        hasEmail: Boolean(parsed.data.email?.trim()),
        hasNotes: Boolean(parsed.data.notes?.trim()),
      },
      status: "success",
    });
    return NextResponse.json(
      {
        leadId: result.lead.id,
        created: result.created,
        updated: result.updated,
      },
      { status: result.created ? 201 : 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create lead";
    await logIntegrationAudit({
      companyId: auth.companyId,
      integrationType: IntegrationType.WEBSITE,
      action: "website.leads.create",
      payload: body,
      status: "error",
      error: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
