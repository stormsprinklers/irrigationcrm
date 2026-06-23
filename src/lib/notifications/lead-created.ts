import type { Lead } from "@prisma/client";
import { UserRole } from "@prisma/client";
import { isEmailConfigured } from "@/lib/inbox/email";
import { sendCompanyEmail } from "@/lib/inbox/email-branding";
import { prisma } from "@/lib/prisma";

export async function notifyLeadCreated(companyId: string, lead: Lead) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      name: true,
      notifyLeadCreated: true,
      sendgridFrom: true,
      emailSenderName: true,
      emailLogoUrl: true,
    },
  });

  if (!company?.notifyLeadCreated) return;

  const staff = await prisma.user.findMany({
    where: {
      companyId,
      status: "ACTIVE",
      role: { in: [UserRole.ADMIN, UserRole.CSR] },
      email: { not: "" },
    },
    select: { email: true, name: true },
  });

  if (!staff.length || !isEmailConfigured()) return;

  const crmUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const leadUrl = crmUrl ? `${crmUrl}/customers/leads` : "/customers/leads";

  const subject = `New lead: ${lead.name}`;
  const body = [
    `A new lead was submitted from ${lead.source ?? "website"}.`,
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

  const branding = {
    companyName: company.name,
    sendgridFrom: company.sendgridFrom,
    emailSenderName: company.emailSenderName,
    emailLogoUrl: company.emailLogoUrl,
  };

  for (const user of staff) {
    if (!user.email) continue;
    try {
        await sendCompanyEmail(branding, {
          to: [user.email],
          subject,
          text: body,
          html: body.replace(/\n/g, "<br>"),
        });
    } catch {
      // continue notifying other staff
    }
  }
}
