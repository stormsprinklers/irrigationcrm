import type { Lead } from "@prisma/client";
import { parseLeadServiceAddress } from "@/lib/leads/address-from-notes";
import { formatCustomerAddress } from "@/lib/notifications/context";
import {
  leadAcknowledgementSnippets,
  resolveLeadAcknowledgementBookingUrl,
} from "@/lib/notifications/lead-acknowledgement-snippets";
import { sendOperationalNotification } from "@/lib/notifications/send";
import { prisma } from "@/lib/prisma";
import { isEmailConfigured } from "@/lib/inbox/email";
import { sendCompanyEmail } from "@/lib/inbox/email-branding";

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

  if (lead.source === "share-the-cheer-nomination" || lead.source === "share-the-cheer-partner") {
    if (!lead.email || !isEmailConfigured()) return;
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, sendgridFrom: true, emailSenderName: true, emailLogoUrl: true },
    });
    if (!company) return;
    const isNomination = lead.source === "share-the-cheer-nomination";
    const text = isNomination
      ? `Thank you for sharing a family with us. Your Share the Cheer nomination has been received for private review. We will reach out if we need more information. A nomination does not guarantee selection.\n\n— ${company.name}`
      : `Thank you for offering to support Share the Cheer. Our office will contact you to confirm the details. Your offer has not yet been assigned to a family or announced publicly.\n\n— ${company.name}`;
    await sendCompanyEmail(
      { companyName: company.name, sendgridFrom: company.sendgridFrom, emailSenderName: company.emailSenderName, emailLogoUrl: company.emailLogoUrl },
      { companyId, to: [lead.email], subject: isNomination ? "We received your Share the Cheer nomination" : "We received your Share the Cheer offer", text, html: text.split("\n").map((line) => line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")).join("<br>") }
    );
    return;
  }

  const consents = asRecord(meta.consents);

  // Require quote consent (or legacy missing = allow for non-estimate sources)
  if (consents.quote === false) return;
  if (!lead.phone && !lead.email) return;

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      name: true,
      bookingSlug: true,
      websiteBookingUrl: true,
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
  const serviceAddress = parseLeadServiceAddress(lead.notes, lead.metadata);

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
      customer_address: formatCustomerAddress(serviceAddress),
      customer_city: serviceAddress?.city?.trim() ?? "",
      company_name: company.name,
      companyName: company.name,
      booking_link: snippets.booking_link,
      estimate_range: snippets.estimate_range,
      company_phone: company.phone ?? "",
    },
  });
}
