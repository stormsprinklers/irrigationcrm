import { NextRequest, NextResponse } from "next/server";
import { IntegrationType } from "@prisma/client";
import { authenticateIntegration, isIntegrationContext } from "@/lib/integrations/auth";
import { logIntegrationAudit } from "@/lib/integrations/audit";
import { websiteEventSchema } from "@/lib/integrations/schemas";
import { recordMarketingEvent } from "@/lib/marketing/queries";

export async function POST(request: NextRequest) {
  const auth = await authenticateIntegration(request, IntegrationType.WEBSITE);
  if (!isIntegrationContext(auth)) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = websiteEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const result = await recordMarketingEvent(auth.companyId, parsed.data);
    await logIntegrationAudit({
      companyId: auth.companyId,
      integrationType: IntegrationType.WEBSITE,
      action: "website.events.create",
      payload: { externalId: parsed.data.externalId, eventType: parsed.data.eventType },
      status: "success",
    });
    return NextResponse.json(
      { eventId: result.event.id, created: result.created },
      { status: result.created ? 201 : 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to record event";
    await logIntegrationAudit({
      companyId: auth.companyId,
      integrationType: IntegrationType.WEBSITE,
      action: "website.events.create",
      payload: body,
      status: "error",
      error: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
