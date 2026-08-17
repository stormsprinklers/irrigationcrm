import { getDefaultFromEmail, sendEmail, type SendEmailResult } from "@/lib/inbox/email";
import { assertOutboundCommsEnabled } from "@/lib/communications/outbound-guard";
import { absolutePublicBlobUrl } from "@/lib/blob/urls";
import { prisma } from "@/lib/prisma";
import {
  applyCompanyEmailSignature,
  applyCompanyEmailSignatureText,
  type CompanySignatureFields,
} from "@/lib/inbox/company-email-signature";

export type EmailBranding = CompanySignatureFields & {
  sendgridFrom?: string | null;
  emailSenderName?: string | null;
  emailLogoUrl?: string | null;
};

export function parseEmailAddress(from: string): { address: string; name: string | null } {
  const named = from.match(/^(.+?)\s*<([^>]+)>$/);
  if (named) {
    return { name: named[1].replace(/^"|"$/g, "").trim(), address: named[2].trim() };
  }
  return { name: null, address: from.trim() };
}

export function formatEmailFromAddress(email: string, displayName: string) {
  const address = parseEmailAddress(email).address;
  const name = displayName.replace(/\\/g, "\\\\").replace(/"/g, '\\"').trim();
  if (!address) return "";
  if (!name) return address;
  return `"${name}" <${address}>`;
}

export function resolveSenderDisplayName(branding: EmailBranding) {
  return (branding.emailSenderName ?? branding.companyName).trim() || branding.companyName;
}

export function resolveFromAddress(branding: EmailBranding, fallbackEmail?: string | null) {
  const raw = branding.sendgridFrom ?? fallbackEmail ?? getDefaultFromEmail();
  if (!raw) return null;
  const { address } = parseEmailAddress(raw);
  return formatEmailFromAddress(address, resolveSenderDisplayName(branding));
}

export function wrapBrandedEmailHtml(html: string, branding: EmailBranding) {
  const withSignature = applyCompanyEmailSignature(html, branding);
  const logoSrc = absolutePublicBlobUrl(branding.emailLogoUrl) ?? branding.emailLogoUrl;
  const logoBlock = logoSrc
    ? `<div style="margin-bottom:16px"><img src="${logoSrc}" alt="${escapeHtml(
        branding.companyName
      )}" width="56" height="56" style="display:block;width:56px;height:56px;border-radius:12px;object-fit:cover" /></div>`
    : "";

  if (withSignature.includes("<html") || withSignature.includes("<body")) {
    return withSignature;
  }

  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#111827;max-width:640px">${logoBlock}${withSignature}</div>`;
}

async function resolveBrandingWithCompanyContact(
  companyId: string,
  branding: EmailBranding
): Promise<EmailBranding> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      name: true,
      phone: true,
      supportEmail: true,
      website: true,
      websiteBaseUrl: true,
      address: true,
      city: true,
      state: true,
      zip: true,
      emailLogoUrl: true,
    },
  });
  if (!company) return branding;

  const fromAddress = branding.sendgridFrom ? parseEmailAddress(branding.sendgridFrom).address : "";
  return {
    ...branding,
    companyName: branding.companyName || company.name,
    emailLogoUrl: branding.emailLogoUrl ?? company.emailLogoUrl,
    phone: branding.phone ?? company.phone,
    supportEmail: branding.supportEmail ?? company.supportEmail ?? fromAddress ?? null,
    website: branding.website ?? company.website ?? company.websiteBaseUrl,
    address: branding.address ?? company.address,
    city: branding.city ?? company.city,
    state: branding.state ?? company.state,
    zip: branding.zip ?? company.zip,
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendCompanyEmail(
  branding: EmailBranding,
  params: {
    /** Company sending the email — required so the outbound-comms freeze can be enforced. */
    companyId: string;
    to: string[];
    subject: string;
    text?: string;
    html: string;
    replyTo?: string;
    fromOverride?: string | null;
    attachments?: Array<{
      filename: string;
      contentType: string;
      content: string;
    }>;
    /** Skip the outbound-comms freeze (admin diagnostics only). */
    bypassCommsFreeze?: boolean;
  }
): Promise<SendEmailResult> {
  if (!params.bypassCommsFreeze) {
    await assertOutboundCommsEnabled(params.companyId, "email");
  }
  const resolved = await resolveBrandingWithCompanyContact(params.companyId, branding);
  const from =
    (params.fromOverride
      ? formatEmailFromAddress(parseEmailAddress(params.fromOverride).address, resolveSenderDisplayName(resolved))
      : null) ?? resolveFromAddress(resolved);
  if (!from) {
    throw new Error("From email address not configured");
  }

  return sendEmail({
    from,
    to: params.to,
    subject: params.subject,
    text: applyCompanyEmailSignatureText(params.text, resolved),
    html: wrapBrandedEmailHtml(params.html, resolved),
    replyTo: params.replyTo,
    attachments: params.attachments,
  });
}
