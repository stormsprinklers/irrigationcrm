import type { Lead } from "@prisma/client";
import { websiteFormDetailLines } from "@/lib/leads/form-details";
import { websiteLeadFormLabel, websiteLeadNotificationTitle } from "@/lib/leads/form-labels";
import {
  formatQuoteEstimate,
  isPricingQuoteLead,
} from "@/lib/leads/pricing-quote-enrichment";
import { isEmailConfigured } from "@/lib/inbox/email";
import { sendCompanyEmail } from "@/lib/inbox/email-branding";
import { prisma } from "@/lib/prisma";

/**
 * Email the company support/contact address when a website lead arrives.
 * Do not fan out to every ADMIN/CSR/SALES personal inbox.
 */
export async function notifyLeadCreated(companyId: string, lead: Lead) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      name: true,
      notifyLeadCreated: true,
      supportEmail: true,
      sendgridFrom: true,
      emailSenderName: true,
      emailLogoUrl: true,
    },
  });

  if (!company?.notifyLeadCreated) return;

  const to = company.supportEmail?.trim();
  if (!to || !isEmailConfigured()) {
    if (company.notifyLeadCreated && !to) {
      console.warn(
        "notifyLeadCreated: set company supportEmail to receive new-lead emails (staff personal inboxes are not used)"
      );
    } else if (company.notifyLeadCreated && !isEmailConfigured()) {
      console.warn(
        "notifyLeadCreated: email provider is not configured; skipping new-lead email"
      );
    }
    return;
  }

  const crmUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const leadUrl = crmUrl ? `${crmUrl}/customers/leads` : "/customers/leads";
  const formLabel = websiteLeadFormLabel(lead.source);
  const meta =
    lead.metadata && typeof lead.metadata === "object" && !Array.isArray(lead.metadata)
      ? (lead.metadata as Record<string, unknown>)
      : {};

  const subject = websiteLeadNotificationTitle(lead.source, lead.name);
  const bodyLines: Array<string | null> = [
    `A new ${formLabel.toLowerCase()} submission was received.`,
    "",
    `Name: ${lead.name}`,
    lead.phone ? `Phone: ${lead.phone}` : null,
    lead.email ? `Email: ${lead.email}` : null,
    lead.source ? `Source: ${lead.source}` : null,
  ];

  if (isPricingQuoteLead(lead.source)) {
    const estimate =
      (typeof meta.formattedEstimate === "string" && meta.formattedEstimate) ||
      formatQuoteEstimate(meta.quote ?? meta.pricing_quote_snapshot) ||
      null;
    const summary =
      (typeof meta.aiIssueSummary === "string" && meta.aiIssueSummary) || null;
    if (estimate) bodyLines.push(`Estimate shown: ${estimate}`);
    if (typeof meta.quoteTitle === "string" && meta.quoteTitle) {
      bodyLines.push(`Quoted option: ${meta.quoteTitle}`);
    }
    if (summary) {
      bodyLines.push("", "What they're dealing with:", summary);
    } else if (lead.notes) {
      bodyLines.push("", lead.notes);
    }
  } else {
    const detailLines = websiteFormDetailLines(meta);
    if (detailLines.length) {
      bodyLines.push("", ...detailLines);
    } else if (lead.notes) {
      bodyLines.push("", lead.notes);
    }
  }

  bodyLines.push("", `View leads: ${leadUrl}`, "", `— ${company.name}`);
  const body = bodyLines.filter((line): line is string => line != null).join("\n");

  await sendCompanyEmail(
    {
      companyName: company.name,
      sendgridFrom: company.sendgridFrom,
      emailSenderName: company.emailSenderName,
      emailLogoUrl: company.emailLogoUrl,
    },
    {
      companyId,
      to: [to],
      subject,
      text: body,
      html: body.replace(/\n/g, "<br>"),
    }
  );
}
