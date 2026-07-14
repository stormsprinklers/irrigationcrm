import type { Lead } from "@prisma/client";
import { websiteLeadFormLabel, websiteLeadNotificationTitle } from "@/lib/leads/form-labels";
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
    }
    return;
  }

  const crmUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const leadUrl = crmUrl ? `${crmUrl}/customers/leads` : "/customers/leads";
  const formLabel = websiteLeadFormLabel(lead.source);

  const subject = websiteLeadNotificationTitle(lead.source, lead.name);
  const body = [
    `A new ${formLabel.toLowerCase()} submission was received.`,
    "",
    `Name: ${lead.name}`,
    lead.phone ? `Phone: ${lead.phone}` : null,
    lead.email ? `Email: ${lead.email}` : null,
    lead.source ? `Source: ${lead.source}` : null,
    "",
    `View leads: ${leadUrl}`,
    "",
    `— ${company.name}`,
  ]
    .filter(Boolean)
    .join("\n");

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
