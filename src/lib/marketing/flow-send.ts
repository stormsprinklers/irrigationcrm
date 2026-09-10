import { CampaignChannel } from "@prisma/client";
import { sendCompanyEmail } from "@/lib/inbox/email-branding";
import { sendSms } from "@/lib/inbox/twilio";
import { twilioSmsStatusCallbackUrl } from "@/lib/app-url";
import { isContactBlocked, normalizePhone } from "@/lib/inbox/contacts";
import { marketingUnsubscribeUrl } from "@/lib/marketing/unsubscribe";
import {
  resolveMarketingEmailFrom,
  resolveMarketingSmsFrom,
} from "@/lib/marketing/sender";
import { buildMarketingEmailPayload } from "@/lib/marketing/outbound-email";
import { prisma } from "@/lib/prisma";
import { renderMarketingMergeFields } from "@/lib/marketing/render-merge";

/** Send one marketing message for a flow enrollment and record a CampaignRecipient. */
export async function sendCampaignMessage(params: {
  campaign: {
    id: string;
    companyId: string;
    name: string;
    subject: string | null;
    company: {
      sendgridFrom: string | null;
      marketingSendgridFrom?: string | null;
      twilioPhone: string | null;
      marketingTwilioPhone?: string | null;
      name: string;
      phone?: string | null;
      timezone?: string | null;
      portalSlug?: string | null;
      bookingSlug?: string | null;
      customerBaseUrl?: string | null;
      googleReviewUrl?: string | null;
      websiteBaseUrl?: string | null;
      termsOfServiceUrl?: string | null;
      privacyPolicyUrl?: string | null;
      emailSenderName: string | null;
      emailLogoUrl: string | null;
    };
  };
  customer: {
    id: string;
    email: string | null;
    phone: string | null;
    name?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    marketingEmailOptOut?: boolean;
    marketingSmsOptOut?: boolean;
    doNotService?: boolean;
  };
  channel: CampaignChannel;
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  flowNodeId?: string;
}) {
  const { campaign, customer, channel } = params;
  const personalized = renderMarketingMergeFields({
    company: campaign.company,
    customer,
    subject: params.subject,
    bodyText: params.bodyText,
    bodyHtml: params.bodyHtml,
  });
  const subject = personalized.subject;
  const bodyText = personalized.bodyText;
  const bodyHtml = personalized.bodyHtml;

  if (customer.doNotService) {
    return false;
  }
  if (channel === CampaignChannel.EMAIL && customer.marketingEmailOptOut) {
    return false;
  }
  if (channel === CampaignChannel.SMS && customer.marketingSmsOptOut) {
    return false;
  }

  const blocked = await isContactBlocked(campaign.companyId, customer.phone, customer.email);
  if (blocked) return false;

  const recipient = await prisma.campaignRecipient.create({
    data: {
      campaignId: campaign.id,
      customerId: customer.id,
      email: customer.email,
      phone: customer.phone,
      status: "pending",
      flowNodeId: params.flowNodeId ?? null,
      channel,
    },
  });

  try {
    if (channel === CampaignChannel.SMS) {
      const fromPhone = resolveMarketingSmsFrom(campaign.company);
      if (!customer.phone || !fromPhone) {
        await prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: { status: "failed", error: "Missing phone" },
        });
        return false;
      }
      const body = bodyText.includes("Reply STOP")
        ? bodyText
        : `${bodyText}\n\nReply STOP to opt out.`;
      const msg = await sendSms({
        companyId: campaign.companyId,
        from: fromPhone,
        to: normalizePhone(customer.phone),
        body,
        statusCallback: twilioSmsStatusCallbackUrl(),
      });
      await prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: { status: "sent", sentAt: new Date(), twilioMessageSid: msg.sid },
      });
      return true;
    }

    const fromEmail = resolveMarketingEmailFrom(campaign.company);
    if (!customer.email || !fromEmail) {
      await prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: { status: "failed", error: "Missing email" },
      });
      return false;
    }

    const outbound = buildMarketingEmailPayload({
      bodyHtml,
      bodyText,
      unsubscribeUrl: marketingUnsubscribeUrl(
        customer.id,
        campaign.companyId,
        campaign.company.customerBaseUrl
      ),
      recipientId: recipient.id,
      publicBaseUrl: campaign.company.customerBaseUrl,
    });

    const response = await sendCompanyEmail(
      {
        companyName: campaign.company.name,
        sendgridFrom: fromEmail,
        emailSenderName: campaign.company.emailSenderName,
        emailLogoUrl: campaign.company.emailLogoUrl,
      },
      {
        companyId: campaign.companyId,
        to: [customer.email],
        subject: subject || campaign.name,
        text: outbound.text,
        html: outbound.html,
      }
    );

    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: {
        status: "sent",
        sentAt: new Date(),
        sendgridMessageId: response.messageId,
      },
    });
    return true;
  } catch (err) {
    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: {
        status: "failed",
        error: err instanceof Error ? err.message : "Send failed",
      },
    });
    return false;
  }
}
