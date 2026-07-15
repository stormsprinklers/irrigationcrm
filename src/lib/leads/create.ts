import { AttributionFirstTouchMethod, LeadStatus, Prisma } from "@prisma/client";
import { after } from "next/server";
import { parseAttributionFromMetadata, recordTouchEvent } from "@/lib/attribution";
import { prisma } from "@/lib/prisma";
import { notifyLeadCreated } from "@/lib/notifications/lead-created";
import { createInboxEntriesFromWebsiteLead } from "@/lib/leads/inbox-from-lead";
import {
  enrichPricingQuoteLead,
  isPricingQuoteLead,
} from "@/lib/leads/pricing-quote-enrichment";
import type { WebsiteLeadInput } from "@/lib/integrations/schemas";

export async function createLeadFromIntegration(
  companyId: string,
  input: WebsiteLeadInput
) {
  const existing = input.externalId
    ? await prisma.lead.findFirst({
        where: { companyId, externalId: input.externalId },
      })
    : null;

  if (existing) {
    return { lead: existing, created: false };
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { defaultLeadAssigneeId: true },
  });

  const enrichment = isPricingQuoteLead(input.source)
    ? await enrichPricingQuoteLead(input)
    : null;

  const notesParts: string[] = [];
  if (enrichment) {
    if (enrichment.estimateLabel) {
      notesParts.push(
        `Estimate shown: ${enrichment.estimateLabel}${
          enrichment.quoteTitle ? ` (${enrichment.quoteTitle})` : ""
        }`
      );
    } else if (enrichment.quoteTitle) {
      notesParts.push(`Quoted option: ${enrichment.quoteTitle}`);
    }
    notesParts.push(`Issues: ${enrichment.issueSummary}`);
    if (input.notes && input.notes !== enrichment.quoteTitle) {
      notesParts.push(input.notes);
    }
  } else {
    if (input.notes) notesParts.push(input.notes);
  }
  if (input.address) notesParts.push(`Address: ${input.address}`);
  if (input.city) notesParts.push(`City: ${input.city}`);

  const metadata = {
    ...((input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
      ? input.metadata
      : {}) as Record<string, unknown>),
    ...(enrichment?.metadataPatch ?? {}),
  };

  const lead = await prisma.lead.create({
    data: {
      companyId,
      name: input.name,
      phone: input.phone ?? null,
      email: input.email || null,
      source: input.source ?? "website",
      status: (input.status as LeadStatus) ?? LeadStatus.NEW,
      notes: notesParts.length ? notesParts.join("\n\n") : null,
      externalId: input.externalId,
      metadata: Object.keys(metadata).length
        ? (metadata as Prisma.InputJsonValue)
        : undefined,
      assignedUserId: company?.defaultLeadAssigneeId ?? null,
    },
  });

  const sessionId =
    typeof metadata.session_id === "string"
      ? metadata.session_id
      : typeof metadata.sessionId === "string"
        ? metadata.sessionId
        : null;

  // Inbox + in-app notifications must finish before we ACK the website push.
  // Fire-and-forget was getting cut off on serverless after the response returned.
  await createInboxEntriesFromWebsiteLead(companyId, lead.id, input, enrichment);

  // Email + attribution can run after the HTTP response; `after` keeps the
  // serverless invocation alive so they aren't dropped mid-flight.
  after(async () => {
    await Promise.all([
      recordTouchEvent({
        companyId,
        leadId: lead.id,
        eventType: "FORM_SUBMIT",
        method: AttributionFirstTouchMethod.FORM,
        attribution: {
          ...parseAttributionFromMetadata(metadata),
          formSource: input.source ?? "website",
          leadSource: input.source ?? "website",
        },
        sessionId,
        phone: input.phone,
        metadata: {
          formSource: input.source ?? "website",
          externalId: input.externalId,
        },
      }).catch((err) => {
        console.error("Failed to record lead attribution touch", err);
      }),
      notifyLeadCreated(companyId, lead).catch((err) => {
        console.error("Failed to send lead-created email", err);
      }),
    ]);
  });

  return { lead, created: true };
}
