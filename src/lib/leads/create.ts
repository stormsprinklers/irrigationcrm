import { LeadStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { notifyLeadCreated } from "@/lib/notifications/lead-created";
import { createInboxEntriesFromWebsiteLead } from "@/lib/leads/inbox-from-lead";
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

  const notesParts: string[] = [];
  if (input.notes) notesParts.push(input.notes);
  if (input.address) notesParts.push(`Address: ${input.address}`);
  if (input.city) notesParts.push(`City: ${input.city}`);

  const lead = await prisma.lead.create({
    data: {
      companyId,
      name: input.name,
      phone: input.phone ?? null,
      email: input.email || null,
      source: input.source ?? "website",
      status: (input.status as LeadStatus) ?? LeadStatus.NEW,
      notes: notesParts.length ? notesParts.join("\n") : null,
      externalId: input.externalId,
      metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      assignedUserId: company?.defaultLeadAssigneeId ?? null,
    },
  });

  notifyLeadCreated(companyId, lead).catch(() => {});
  createInboxEntriesFromWebsiteLead(companyId, lead.id, input).catch((err) => {
    console.error("Failed to create inbox entry for website lead", err);
  });

  return { lead, created: true };
}
