import type { Lead } from "@prisma/client";
import { parseLeadServiceAddress } from "@/lib/leads/address-from-notes";
import { formatCustomerAddress } from "@/lib/notifications/context";
import {
  leadAcknowledgementSnippets,
  resolveLeadAcknowledgementBookingUrl,
} from "@/lib/notifications/lead-acknowledgement-snippets";
import { sendOperationalNotification } from "@/lib/notifications/send";
import { prisma } from "@/lib/prisma";

function firstNameFrom(name: string) {
  const part = name.trim().split(/\s+/)[0];
  return part || "there";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Customer-facing SMS/email when a website lead is received (quote consent).
 */
export async function notifyLeadAcknowledged(companyId: string, lead: Lead) {
  const meta = asRecord(lead.metadata);

  const consents = asRecord(meta.consents);

  // Require quote consent (or legacy missing = allow for non-estimate sources)
  if (consents.quote === false) return;
  if (!lead.phone && !lead.email) return;

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      name: true,
      bookingSlug: true,
      onlineBookingEnabled: true,
      phone: true,
      customerBaseUrl: true,
      websiteBaseUrl: true,
      website: true,
      campaignCtaLinks: true,
    },
  });
  if (!company) return;

  const bookingLink = resolveLeadAcknowledgementBookingUrl(company, meta);
  const snippets = leadAcknowledgementSnippets(meta, bookingLink);

  await sendOperationalNotification({
    companyId,
    event: "LEAD_ACKNOWLEDGED",
    recipient: {
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
    },
    context: {
      customer_first_name: firstNameFrom(lead.name),
      customer_last_name: lead.name.trim().split(/\s+/).slice(1).join(" ") || "",
      customer_address: formatCustomerAddress(parseLeadServiceAddress(lead.notes, lead.metadata)),
      company_name: company.name,
      companyName: company.name,
      booking_link: snippets.booking_link,
      estimate_range: snippets.estimate_range,
      company_phone: company.phone ?? "",
    },
  });
}
