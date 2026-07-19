import { Channel } from "@prisma/client";
import { isEmailConfigured } from "@/lib/inbox/email";
import { sendCompanyEmail } from "@/lib/inbox/email-branding";
import { sendSms } from "@/lib/inbox/twilio";
import { twilioSmsStatusCallbackUrl } from "@/lib/app-url";
import { prisma } from "@/lib/prisma";
import { getOutboundCommsState, DEFAULT_OUTBOUND_FREEZE_REASON } from "@/lib/communications/outbound-guard";
import { assertCustomerCanReceiveNotifications } from "./guard";
import { technicianPhotoMediaUrl } from "./technician-photo";
import {
  buildTrackedUrlMap,
  injectTrackedUrlsInText,
  templateContextWithTrackedPlaceholders,
  type TrackedLinkKind,
} from "./tracked-links";
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
  deliveryIds: string[];
};

export type SendOptions = {
  visitId?: string;
  invoiceId?: string;
  estimateId?: string;
  /** Assigned technician for visit notifications (e.g. en-route MMS photo). */
  technicianUserId?: string;
  /** Only send SMS (skip email). */
  smsOnly?: boolean;
  /** Only send SMS if email fails or customer has no email. */
  smsBackupOnly?: boolean;
  /** Raw link placeholders to replace with tracked URLs. */
  linkPlaceholders?: Partial<Record<TrackedLinkKind, string>>;
};

const EVENT_TOGGLE_MAP: Record<NotificationEvent, keyof CompanyNotifyFlags | null> = {
  VISIT_SCHEDULED: "notifyVisitScheduled",
  VISIT_TIME_UPDATED: "notifyVisitTimeUpdated",
  VISIT_CANCELLED: "notifyVisitCancelled",
  VISIT_COMPLETED: "notifyVisitCompleted",
  VISIT_EN_ROUTE: "notifyVisitEnRoute",
  REVIEW_REQUEST: "notifyReviewRequest",
  INVOICE_SENT: null,
  INVOICE_REMINDER: null,
  INVOICE_PAID_RECEIPT: "notifyInvoicePaid",
  INVOICE_PAYMENT_FAILED: "notifyInvoicePaymentFailed",
  ESTIMATE_SENT: "notifyEstimateSent",
  ESTIMATE_FOLLOW_UP: "notifyEstimateFollowUp",
  FEEDBACK_SURVEY: "notifyFeedbackSurvey",
};

type CompanyNotifyFlags = {
  notifyVisitScheduled: boolean;
  notifyVisitTimeUpdated: boolean;
  notifyVisitCancelled: boolean;
  notifyVisitCompleted: boolean;
  notifyVisitEnRoute: boolean;
  notifyReviewRequest: boolean;
  notifyInvoicePaid: boolean;
  notifyInvoicePaymentFailed: boolean;
  notifyEstimateSent: boolean;
  notifyEstimateFollowUp: boolean;
  notifyFeedbackSurvey: boolean;
};

async function isEventEnabled(
  company: CompanyNotifyFlags,
  event: NotificationEvent
): Promise<boolean> {
  const key = EVENT_TOGGLE_MAP[event];
  if (!key) return true;
  return company[key];
}

export async function sendOperationalNotification(params: {
  companyId: string;
  event: NotificationEvent;
  recipient: NotificationRecipient;
  context: TemplateContext;
  options?: SendOptions;
}): Promise<SendResult> {
  const result: SendResult = { emailSent: false, smsSent: false, skipped: [], deliveryIds: [] };
  const options = params.options ?? {};

  const freeze = await getOutboundCommsState(params.companyId);
  if (freeze.disabled) {
    const detail = freeze.reason?.trim() || DEFAULT_OUTBOUND_FREEZE_REASON;
    result.skipped.push(`Outbound communications disabled: ${detail}`);
    return result;
  }

  const guard = await assertCustomerCanReceiveNotifications({
    companyId: params.companyId,
    customerId: params.recipient.customerId,
    phone: params.recipient.phone,
    email: params.recipient.email,
  });
  if (!guard.allowed) {
    result.skipped.push(guard.reason);
    return result;
  }

  const company = await prisma.company.findUnique({
    where: { id: params.companyId },
    select: {
      name: true,
      twilioPhone: true,
      sendgridFrom: true,
      emailSenderName: true,
      emailLogoUrl: true,
      termsOfServiceUrl: true,
      privacyPolicyUrl: true,
      notifyVisitScheduled: true,
      notifyVisitTimeUpdated: true,
      notifyVisitCancelled: true,
      notifyVisitCompleted: true,
      notifyVisitEnRoute: true,
      notifyVisitEnRouteIncludeTechnicianPhoto: true,
      notifyReviewRequest: true,
      notifyInvoicePaid: true,
      notifyInvoicePaymentFailed: true,
      notifyEstimateSent: true,
      notifyEstimateFollowUp: true,
      notifyFeedbackSurvey: true,
    },
  });
  if (!company) return result;

  if (!(await isEventEnabled(company, params.event))) {
    result.skipped.push(`${params.event} notifications disabled`);
    return result;
  }

  const rules = await prisma.notificationRule.findMany({
    where: { companyId: params.companyId, event: params.event, enabled: true },
    include: { template: true },
  });
  if (rules.length === 0) return result;

  let technicianPhotoUrl: string | null = null;
  if (
    params.event === "VISIT_EN_ROUTE" &&
    company.notifyVisitEnRouteIncludeTechnicianPhoto &&
    options.technicianUserId
  ) {
    const technician = await prisma.user.findFirst({
      where: { id: options.technicianUserId, companyId: params.companyId },
      select: { photoUrl: true },
    });
    technicianPhotoUrl = technicianPhotoMediaUrl({
      userId: options.technicianUserId,
      photoUrl: technician?.photoUrl,
    });
  }

  const linkPlaceholders = Object.fromEntries(
    Object.entries(options.linkPlaceholders ?? {}).filter(([, v]) => Boolean(v))
  ) as NonNullable<SendOptions["linkPlaceholders"]>;

  const baseContext: TemplateContext = {
    ...params.context,
    companyName: company.name,
    company_name: company.name,
    terms_of_service_url: company.termsOfServiceUrl?.trim() ?? "",
    privacy_policy_url: company.privacyPolicyUrl?.trim() ?? "",
    customerName: params.recipient.name ?? params.context.customerName ?? "Customer",
  };

  const renderContext = templateContextWithTrackedPlaceholders(baseContext, linkPlaceholders);

  const branding = {
    companyName: company.name,
    sendgridFrom: company.sendgridFrom,
    emailSenderName: company.emailSenderName,
    emailLogoUrl: company.emailLogoUrl,
  };

  let emailAttempted = false;
  let emailFailed = false;

  for (const rule of rules) {
    if (options.smsOnly && rule.template.channel === Channel.EMAIL) continue;
    if (options.smsBackupOnly && rule.template.channel === Channel.SMS) continue;

    const delivery = await prisma.notificationDelivery.create({
      data: {
        companyId: params.companyId,
        customerId: params.recipient.customerId ?? null,
        event: params.event,
        channel: rule.template.channel,
        visitId: options.visitId ?? null,
        invoiceId: options.invoiceId ?? null,
        estimateId: options.estimateId ?? null,
      },
    });
    result.deliveryIds.push(delivery.id);

    const urlMap = await buildTrackedUrlMap(delivery.id, linkPlaceholders);

    let body = renderTemplate(rule.template.body, renderContext);
    body = injectTrackedUrlsInText(body, urlMap);

    if (rule.template.channel === Channel.EMAIL && !options.smsOnly) {
      const to = params.recipient.email;
      if (!to || !isEmailConfigured()) {
        emailFailed = true;
        continue;
      }
      emailAttempted = true;
      try {
        const subject = renderTemplate(
          rule.template.subject ?? `${company.name} notification`,
          renderContext
        );
        await sendCompanyEmail(branding, {
          companyId: params.companyId,
          to: [to],
          subject: injectTrackedUrlsInText(subject, urlMap),
          text: body,
          html: body.split("\n").map((line) => `<p>${line}</p>`).join(""),
        });
        await prisma.notificationDelivery.update({
          where: { id: delivery.id },
          data: { emailSent: true },
        });
        result.emailSent = true;
      } catch {
        emailFailed = true;
        await prisma.notificationDelivery.update({
          where: { id: delivery.id },
          data: { emailFailedAt: new Date() },
        });
      }
    }

    if (rule.template.channel === Channel.SMS) {
      const to = params.recipient.phone;
      if (!to || !company.twilioPhone || !process.env.TWILIO_ACCOUNT_SID) continue;
      if (options.smsBackupOnly && !emailFailed && emailAttempted && result.emailSent) continue;
      if (options.smsBackupOnly && !emailAttempted && params.recipient.email) continue;

      try {
        await sendSms({
          companyId: params.companyId,
          from: company.twilioPhone,
          to,
          body,
          mediaUrl:
            params.event === "VISIT_EN_ROUTE" && technicianPhotoUrl ? [technicianPhotoUrl] : undefined,
          statusCallback: twilioSmsStatusCallbackUrl(),
        });
        await prisma.notificationDelivery.update({
          where: { id: delivery.id },
          data: { smsSent: true },
        });
        result.smsSent = true;
      } catch {
        // best-effort
      }
    }
  }

  if (options.smsBackupOnly && emailAttempted && !result.emailSent && !result.smsSent) {
    const smsRules = rules.filter((r) => r.template.channel === Channel.SMS);
    for (const rule of smsRules) {
      const delivery = await prisma.notificationDelivery.create({
        data: {
          companyId: params.companyId,
          customerId: params.recipient.customerId ?? null,
          event: params.event,
          channel: Channel.SMS,
          visitId: options.visitId ?? null,
          invoiceId: options.invoiceId ?? null,
          estimateId: options.estimateId ?? null,
        },
      });
      result.deliveryIds.push(delivery.id);

      const urlMap = await buildTrackedUrlMap(delivery.id, linkPlaceholders);

      const body = injectTrackedUrlsInText(
        renderTemplate(rule.template.body, renderContext),
        urlMap
      );
      const to = params.recipient.phone;
      if (!to || !company.twilioPhone) continue;
      try {
        await sendSms({
          companyId: params.companyId,
          from: company.twilioPhone,
          to,
          body,
          mediaUrl: params.event === "VISIT_EN_ROUTE" && technicianPhotoUrl ? [technicianPhotoUrl] : undefined,
          statusCallback: twilioSmsStatusCallbackUrl(),
        });
        await prisma.notificationDelivery.update({ where: { id: delivery.id }, data: { smsSent: true } });
        result.smsSent = true;
        break;
      } catch {
        // best-effort
      }
    }
  }

  return result;
}

export async function ensureDefaultNotificationTemplates(companyId: string) {
  const { DEFAULT_TEMPLATES } = await import("./templates");

  const defaultEnabled = new Set<NotificationEvent>([
    "VISIT_SCHEDULED",
    "VISIT_EN_ROUTE",
    "VISIT_TIME_UPDATED",
    "VISIT_CANCELLED",
    "VISIT_COMPLETED",
    "REVIEW_REQUEST",
    "INVOICE_PAID_RECEIPT",
    "INVOICE_PAYMENT_FAILED",
    "FEEDBACK_SURVEY",
    "ESTIMATE_FOLLOW_UP",
  ]);

  for (const tpl of DEFAULT_TEMPLATES) {
    const existing = await prisma.notificationTemplate.findFirst({
      where: { companyId, slug: tpl.slug, channel: tpl.channel },
    });

    const template =
      existing ??
      (await prisma.notificationTemplate.create({
        data: {
          companyId,
          channel: tpl.channel,
          slug: tpl.slug,
          name: tpl.name,
          subject: tpl.subject ?? null,
          body: tpl.body,
        },
      }));

    const ruleExists = await prisma.notificationRule.findFirst({
      where: { companyId, event: tpl.event, templateId: template.id },
    });

    if (!ruleExists) {
      await prisma.notificationRule.create({
        data: {
          companyId,
          event: tpl.event,
          templateId: template.id,
          enabled: defaultEnabled.has(tpl.event),
        },
      });
    }
  }
}
