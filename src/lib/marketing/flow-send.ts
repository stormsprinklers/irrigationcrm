import { CampaignChannel } from "@prisma/client";
import { getDefaultFromEmail } from "@/lib/inbox/email";
import { sendCompanyEmail } from "@/lib/inbox/email-branding";
import { sendSms } from "@/lib/inbox/twilio";
import { twilioSmsStatusCallbackUrl } from "@/lib/app-url";
import { isContactBlocked, normalizePhone } from "@/lib/inbox/contacts";
import {
  appendMarketingUnsubscribeFooter,
  marketingUnsubscribeUrl,
} from "@/lib/marketing/unsubscribe";
import { rewriteTrackedLinks } from "@/lib/marketing/link-tracking";
import { prisma } from "@/lib/prisma";

/** Send one marketing message for a flow enrollment and record a CampaignRecipient. */
export async function sendCampaignMessage(params: {
  campaign: {
    id: string;
    companyId: string;
    name: string;
    subject: string | null;
    company: {
      sendgridFrom: string | null;
      twilioPhone: string | null;
      name: string;
      emailSenderName: string | null;
      emailLogoUrl: string | null;
    };
  };
  customer: {
    id: string;
    email: string | null;
    phone: string | null;
    marketingEmailOptOut?: boolean;
  };
  channel: CampaignChannel;
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
}) {
  const { campaign, customer, channel, subject, bodyText, bodyHtml } = params;

  if (channel === CampaignChannel.EMAIL && customer.marketingEmailOptOut) {
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
    },
  });

  try {
    if (channel === CampaignChannel.SMS) {
      const fromPhone = campaign.company.twilioPhone;
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

    const fromEmail = campaign.company.sendgridFrom ?? getDefaultFromEmail();
    if (!customer.email || !fromEmail) {
      await prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: { status: "failed", error: "Missing email" },
      });
      return false;
    }

    let rawHtml = bodyHtml ?? `<p>${bodyText.replace(/\n/g, "<br/>")}</p>`;
    rawHtml = appendMarketingUnsubscribeFooter(
      rawHtml,
      marketingUnsubscribeUrl(customer.id, campaign.companyId)
    );
    const html = rewriteTrackedLinks(rawHtml, recipient.id);

    const response = await sendCompanyEmail(
      {
        companyName: campaign.company.name,
        sendgridFrom: campaign.company.sendgridFrom,
        emailSenderName: campaign.company.emailSenderName,
        emailLogoUrl: campaign.company.emailLogoUrl,
      },
      {
        companyId: campaign.companyId,
        to: [customer.email],
        subject: subject || campaign.name,
        text: bodyText,
        html,
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
