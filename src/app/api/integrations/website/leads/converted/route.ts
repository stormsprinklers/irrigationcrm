import { LeadStatus, IntegrationType, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateIntegration, isIntegrationContext } from "@/lib/integrations/auth";
import { logIntegrationAudit } from "@/lib/integrations/audit";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  externalId: z.string().min(1),
  websiteLeadId: z.string().optional().nullable(),
  jobId: z.string().optional().nullable(),
});

/** Mark a previously ingested website lead as WON when they book online. */
export async function POST(request: NextRequest) {
  const auth = await authenticateIntegration(request, IntegrationType.WEBSITE);
  if (!isIntegrationContext(auth)) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const { externalId, websiteLeadId, jobId } = parsed.data;
    const ids = [externalId];
    if (websiteLeadId) ids.push(`pricing-nobook:${websiteLeadId}`);

    const lead = await prisma.lead.findFirst({
      where: {
        companyId: auth.companyId,
        externalId: { in: [...new Set(ids)] },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!lead) {
      return NextResponse.json({ ok: true, updated: false });
    }

    const meta =
      lead.metadata && typeof lead.metadata === "object" && !Array.isArray(lead.metadata)
        ? { ...(lead.metadata as Record<string, unknown>) }
        : {};
    if (jobId) meta.hcpJobId = jobId;
    meta.bookedOnline = true;

    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        status: LeadStatus.WON,
        metadata: meta as Prisma.InputJsonValue,
      },
    });

    await logIntegrationAudit({
      companyId: auth.companyId,
      integrationType: IntegrationType.WEBSITE,
      action: "website.leads.converted",
      payload: { externalId, leadId: lead.id, jobId },
      status: "success",
    });

    return NextResponse.json({ ok: true, updated: true, leadId: lead.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to mark lead converted";
    await logIntegrationAudit({
      companyId: auth.companyId,
      integrationType: IntegrationType.WEBSITE,
      action: "website.leads.converted",
      payload: body,
      status: "error",
      error: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
