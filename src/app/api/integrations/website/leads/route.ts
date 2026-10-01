import { NextRequest, NextResponse } from "next/server";
import { IntegrationType } from "@prisma/client";
import { authenticateIntegration, isIntegrationContext } from "@/lib/integrations/auth";
import { logIntegrationAudit } from "@/lib/integrations/audit";
import { websiteLeadSchema } from "@/lib/integrations/schemas";
import { createLeadFromIntegration } from "@/lib/leads/create";
import { sendMetaCrmLeadEvent } from "@/lib/meta/conversions-api";

export async function POST(request: NextRequest) {
  const auth = await authenticateIntegration(request, IntegrationType.WEBSITE);
  if (!isIntegrationContext(auth)) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = websiteLeadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const result = await createLeadFromIntegration(auth.companyId, parsed.data);
    let metaConversionSent: boolean | undefined;
    if (result.created && parsed.data.source === "meta-sprinkler-winterization") {
      const metaResult = await sendMetaCrmLeadEvent({
        leadId: result.lead.id,
        name: result.lead.name,
        phone: result.lead.phone,
        email: result.lead.email,
        city: parsed.data.city,
        metadata:
          parsed.data.metadata && typeof parsed.data.metadata === "object"
            ? parsed.data.metadata
            : null,
        eventTime: result.lead.createdAt,
      });
      metaConversionSent = metaResult.ok;
      await logIntegrationAudit({
        companyId: auth.companyId,
        integrationType: IntegrationType.WEBSITE,
        action: "meta.conversions.lead",
        payload: { leadId: result.lead.id, eventId: parsed.data.metadata?.metaEvent },
        status: metaResult.ok ? "success" : "error",
        error: metaResult.ok ? undefined : metaResult.error,
      });
      if (!metaResult.ok) {
        console.error("Meta Conversions API Lead event failed", metaResult.error);
      }
    }
    await logIntegrationAudit({
      companyId: auth.companyId,
      integrationType: IntegrationType.WEBSITE,
      action: "website.leads.create",
      payload: { externalId: parsed.data.externalId },
      status: "success",
    });
    return NextResponse.json(
      {
        leadId: result.lead.id,
        created: result.created,
        ...(metaConversionSent !== undefined ? { metaConversionSent } : {}),
      },
      { status: result.created ? 201 : 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create lead";
    await logIntegrationAudit({
      companyId: auth.companyId,
      integrationType: IntegrationType.WEBSITE,
      action: "website.leads.create",
      payload: { externalId: parsed.data.externalId },
      status: "error",
      error: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
