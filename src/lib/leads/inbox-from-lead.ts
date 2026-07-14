import { EmailFolder, MessageDirection, Scope } from "@prisma/client";
import type { WebsiteLeadInput } from "@/lib/integrations/schemas";
import { findOrCreateSmsConversation } from "@/lib/inbox/conversations";
import { messageSharesContactInfo } from "@/lib/inbox/contact-info-detection";
import { processInboundMessageContactInfo } from "@/lib/inbox/contact-info-process";
import { notifyWebsiteFormInbox } from "@/lib/notifications/in-app";
import { prisma } from "@/lib/prisma";

function formatLeadInboxBody(input: WebsiteLeadInput) {
  const lines = [
    `New website form submission`,
    ``,
    `Name: ${input.name}`,
  ];
  if (input.phone) lines.push(`Phone: ${input.phone}`);
  if (input.email) lines.push(`Email: ${input.email}`);
  if (input.source) lines.push(`Source: ${input.source}`);
  if (input.address) lines.push(`Address: ${input.address}`);
  if (input.city) lines.push(`City: ${input.city}`);
  if (input.notes) {
    lines.push(``, `Message:`, input.notes);
  }
  if (input.metadata && typeof input.metadata === "object") {
    const meta = input.metadata as Record<string, unknown>;
    const nested =
      meta.attribution && typeof meta.attribution === "object" && !Array.isArray(meta.attribution)
        ? (meta.attribution as Record<string, unknown>)
        : meta;
    const landing = meta.landing_page ?? meta.landingPage ?? nested.landingPage;
    const utmSource = nested.source ?? nested.utm_source ?? meta.utm_source;
    const utmMedium = nested.medium ?? nested.utm_medium ?? meta.utm_medium;
    const utmCampaign = nested.campaign ?? nested.utm_campaign ?? meta.utm_campaign;
    if (landing || utmSource || utmMedium || utmCampaign) {
      lines.push(``, `Attribution:`);
      if (landing) lines.push(`Landing page: ${landing}`);
      if (utmSource) lines.push(`UTM source: ${utmSource}`);
      if (utmMedium) lines.push(`UTM medium: ${utmMedium}`);
      if (utmCampaign) lines.push(`UTM campaign: ${utmCampaign}`);
    }
  }
  return lines.join("\n");
}

export async function createInboxEntriesFromWebsiteLead(
  companyId: string,
  leadId: string,
  input: WebsiteLeadInput
) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { sendgridFrom: true },
  });

  const body = formatLeadInboxBody(input);
  const subject = `Website form: ${input.source ?? "contact"} — ${input.name}`;
  const threadId = `website-lead:${leadId}`;

  if (input.email?.trim()) {
    const emailMessage = await prisma.emailMessage.create({
      data: {
        companyId,
        scope: Scope.EXTERNAL,
        folder: EmailFolder.INBOX,
        fromEmail: input.email.trim(),
        toEmails: [company?.sendgridFrom ?? "inbox@stormsprinklers.com"],
        subject,
        bodyText: body,
        isRead: false,
        threadId,
      },
    });
    await notifyWebsiteFormInbox({
      companyId,
      emailId: emailMessage.id,
      name: input.name,
      source: input.source,
    }).catch((err) => console.error("In-app notification failed for website form", err));
  } else if (input.phone?.trim()) {
    const conversation = await findOrCreateSmsConversation({
      companyId,
      scope: Scope.EXTERNAL,
      participantPhone: input.phone.trim(),
      title: input.name,
    });

    const inboundBody = `[Website form — ${input.source ?? "contact"} | lead:${leadId}]\n\n${body}`;
    const contactInfoDetected = messageSharesContactInfo(inboundBody);

    const createdMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: MessageDirection.INBOUND,
        body: inboundBody,
        contactInfoDetected,
      },
    });

    if (contactInfoDetected) {
      void processInboundMessageContactInfo(createdMessage.id).catch((err) =>
        console.error("Lead SMS contact info processing failed", err)
      );
    }

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date(), title: input.name },
    });
    await notifyWebsiteFormInbox({
      companyId,
      conversationId: conversation.id,
      name: input.name,
      source: input.source,
    }).catch((err) => console.error("In-app notification failed for website form", err));
  } else {
    const emailMessage = await prisma.emailMessage.create({
      data: {
        companyId,
        scope: Scope.EXTERNAL,
        folder: EmailFolder.INBOX,
        fromEmail: "website-forms@stormsprinklers.com",
        toEmails: [company?.sendgridFrom ?? "inbox@stormsprinklers.com"],
        subject,
        bodyText: body,
        isRead: false,
        threadId,
      },
    });
    await notifyWebsiteFormInbox({
      companyId,
      emailId: emailMessage.id,
      name: input.name,
      source: input.source,
    }).catch((err) => console.error("In-app notification failed for website form", err));
  }
}
