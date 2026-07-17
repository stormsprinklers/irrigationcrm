import { getDefaultFromEmail, sendEmail, type SendEmailResult } from "@/lib/inbox/email";
import { assertOutboundCommsEnabled } from "@/lib/communications/outbound-guard";
import { absolutePublicBlobUrl } from "@/lib/blob/urls";

export type EmailBranding = {
  companyName: string;
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

export function wrapBrandedEmailHtml(
  html: string,
  branding: Pick<EmailBranding, "emailLogoUrl" | "companyName">
) {
  const logoSrc = absolutePublicBlobUrl(branding.emailLogoUrl) ?? branding.emailLogoUrl;
  const logoBlock = logoSrc
    ? `<div style="margin-bottom:16px"><img src="${logoSrc}" alt="${escapeHtml(
        branding.companyName
      )}" width="56" height="56" style="display:block;width:56px;height:56px;border-radius:12px;object-fit:cover" /></div>`
    : "";

  if (html.includes("<html") || html.includes("<body")) {
    return html;
  }

  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#111827;max-width:640px">${logoBlock}${html}</div>`;
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
  const from =
    (params.fromOverride ? formatEmailFromAddress(parseEmailAddress(params.fromOverride).address, resolveSenderDisplayName(branding)) : null) ??
    resolveFromAddress(branding);
  if (!from) {
    throw new Error("From email address not configured");
  }

  return sendEmail({
    from,
    to: params.to,
    subject: params.subject,
    text: params.text,
    html: wrapBrandedEmailHtml(params.html, branding),
    replyTo: params.replyTo,
    attachments: params.attachments,
  });
}
