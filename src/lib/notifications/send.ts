import { Channel } from "@prisma/client";
import { isEmailConfigured } from "@/lib/inbox/email";
import { sendCompanyEmail } from "@/lib/inbox/email-branding";
import { sendSms } from "@/lib/inbox/twilio";
import { isContactBlocked } from "@/lib/inbox/contacts";
import { prisma } from "@/lib/prisma";
import { renderTemplate, type NotificationEvent, type TemplateContext } from "./templates";

export type NotificationRecipient = {
  customerId?: string;
  name?: string;
  email?: string | null;
  phone?: string | null;
};

export type SendResult = {
  emailSent: boolean;
  smsSent: boolean;
  skipped: string[];
};

export async function sendOperationalNotification(params: {
  companyId: string;
  event: NotificationEvent;
  recipient: NotificationRecipient;
  context: TemplateContext;
}): Promise<SendResult> {
  const result: SendResult = { emailSent: false, smsSent: false, skipped: [] };

  const company = await prisma.company.findUnique({
    where: { id: params.companyId },
    select: {
      name: true,
      twilioPhone: true,
      sendgridFrom: true,
      emailSenderName: true,
      emailLogoUrl: true,
      notifyVisitScheduled: true,
      notifyEstimateSent: true,
      notifyInvoicePaid: true,
    },
  });
  if (!company) return result;

  if (params.event === "VISIT_SCHEDULED" && !company.notifyVisitScheduled) {
    result.skipped.push("visit notifications disabled");
    return result;
  }
  if (params.event === "ESTIMATE_SENT" && !company.notifyEstimateSent) {
    result.skipped.push("estimate notifications disabled");
    return result;
  }

  const rules = await prisma.notificationRule.findMany({
    where: { companyId: params.companyId, event: params.event, enabled: true },
    include: { template: true },
  });

  if (rules.length === 0) return result;

  const blocked = await isContactBlocked(
    params.companyId,
    params.recipient.phone,
    params.recipient.email
  );
  if (blocked) {
    result.skipped.push("contact blocked");
    return result;
  }

  const context: TemplateContext = {
    companyName: company.name,
    customerName: params.recipient.name ?? "Customer",
    ...params.context,
  };

  for (const rule of rules) {
    const body = renderTemplate(rule.template.body, context);

    if (rule.template.channel === Channel.EMAIL) {
      const to = params.recipient.email;
      if (!to || !isEmailConfigured()) continue;
      const branding = {
        companyName: company.name,
        sendgridFrom: company.sendgridFrom,
        emailSenderName: company.emailSenderName,
        emailLogoUrl: company.emailLogoUrl,
      };
      try {
        const subject = renderTemplate(
          rule.template.subject ?? `${company.name} notification`,
          context
        );
        await sendCompanyEmail(branding, {
          to: [to],
          subject,
          text: body,
          html: body.split("\n").map((line) => `<p>${line}</p>`).join(""),
        });
        result.emailSent = true;
      } catch {
        // best-effort
      }
    }

    if (rule.template.channel === Channel.SMS) {
      const to = params.recipient.phone;
      if (!to || !company.twilioPhone || !process.env.TWILIO_ACCOUNT_SID) continue;
      try {
        await sendSms({
          from: company.twilioPhone,
          to,
          body,
          statusCallback: `${process.env.NEXT_PUBLIC_APP_URL}/api/twilio/sms/status`,
        });
        result.smsSent = true;
      } catch {
        // best-effort
      }
    }
  }

  return result;
}

export async function ensureDefaultNotificationTemplates(companyId: string) {
  const existing = await prisma.notificationTemplate.count({ where: { companyId } });
  if (existing > 0) return;

  const { DEFAULT_TEMPLATES } = await import("./templates");

  for (const tpl of DEFAULT_TEMPLATES) {
    const template = await prisma.notificationTemplate.create({
      data: {
        companyId,
        channel: tpl.channel,
        slug: tpl.slug,
        name: tpl.name,
        subject: tpl.subject ?? null,
        body: tpl.body,
      },
    });

    await prisma.notificationRule.create({
      data: {
        companyId,
        event: tpl.event,
        templateId: template.id,
        enabled: tpl.event === "VISIT_SCHEDULED",
      },
    });
  }
}
