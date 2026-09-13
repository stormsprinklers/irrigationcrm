import { stormBrand } from "@/lib/branding";
import { requireOpenAIApiKey } from "@/lib/openai/client";
import { htmlToPlainText } from "@/lib/marketing/link-tracking";
import {
  renderEmailTemplateSkeleton,
  type EmailTemplateId,
} from "@/lib/marketing/email-templates";
import type { CampaignAllowedLink } from "@/lib/marketing/campaign-links";
import { buildCompanySignatureHtml } from "@/lib/inbox/company-email-signature";

export type EmailBrandPalette = {
  /** Main CTA / accent */
  primary: string;
  /** Headers / dark text backgrounds */
  secondary: string;
  soft?: string;
  panel?: string;
  accent?: string | null;
  /** Optional extra swatches (accent, light bg, white, etc.) */
  extras?: string[];
};

function normalizeHex(value: string | undefined, fallback: string) {
  const raw = (value ?? "").trim();
  if (!raw) return fallback;
  const withHash = raw.startsWith("#") ? raw : `#${raw}`;
  if (!/^#[0-9a-fA-F]{6}$/.test(withHash)) return fallback;
  return withHash.toUpperCase();
}

function formatAllowedLinks(links: CampaignAllowedLink[]) {
  if (!links.length) {
    return "NONE CONFIGURED — do not invent URLs. Omit CTA buttons or use plain text without href.";
  }
  return links.map((l) => `- ${l.label}: ${l.url}`).join("\n");
}

function stripDisallowedHrefs(html: string, allowedUrls: Set<string>) {
  return html.replace(/\bhref\s*=\s*(["'])(.*?)\1/gi, (full, quote: string, href: string) => {
    const trimmed = href.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("mailto:") || trimmed.startsWith("tel:")) {
      return full;
    }
    if (allowedUrls.has(trimmed)) return full;
    // Normalize trailing slash mismatch
    const withoutSlash = trimmed.replace(/\/$/, "");
    for (const allowed of allowedUrls) {
      if (allowed.replace(/\/$/, "") === withoutSlash) return full;
    }
    return `href=${quote}#${quote}`;
  });
}

export async function generateCampaignEmail(params: {
  prompt: string;
  subject?: string;
  companyName: string;
  ctaUrl?: string;
  /** When set, AI revises this HTML instead of generating from scratch. */
  existingHtml?: string;
  /** When the template is plain text, AI revises this body instead of HTML. */
  existingText?: string;
  brandPalette?: EmailBrandPalette;
  templateId?: EmailTemplateId | string | null;
  allowedLinks?: CampaignAllowedLink[];
  imageUrls?: string[];
  logoUrl?: string | null;
  companyPhone?: string | null;
  companyEmail?: string | null;
  companyWebsite?: string | null;
  companyAddress?: string | null;
  companyCity?: string | null;
  companyState?: string | null;
  companyZip?: string | null;
}) {
  const apiKey = requireOpenAIApiKey();
  const templateId = "plain";
  const isPlain = true;
  const existingHtml = params.existingHtml?.trim() ?? "";
  const existingText = params.existingText?.trim() ?? "";
  const existing = isPlain ? existingText : existingHtml;
  const isEdit = Boolean(existing);
  const allowedLinks = params.allowedLinks ?? [];
  const imageUrls = (params.imageUrls ?? []).filter(Boolean);
  const websiteRaw = params.companyWebsite?.trim();
  const websiteUrl = websiteRaw
    ? /^https?:\/\//i.test(websiteRaw)
      ? websiteRaw
      : `https://${websiteRaw}`
    : null;
  const allowedUrlSet = new Set<string>([
    ...allowedLinks.map((l) => l.url),
    ...imageUrls,
    ...(params.logoUrl ? [params.logoUrl] : []),
    ...(websiteUrl ? [websiteUrl] : []),
  ]);

  const primary = normalizeHex(params.brandPalette?.primary, stormBrand.sky);
  const secondary = normalizeHex(params.brandPalette?.secondary, stormBrand.navy);
  const soft = normalizeHex(params.brandPalette?.soft, stormBrand.ice);
  const panel = normalizeHex(params.brandPalette?.panel, "#E8F4FA");
  const accent = normalizeHex(params.brandPalette?.accent ?? undefined, stormBrand.coral);
  const extras = (params.brandPalette?.extras ?? [])
    .map((c) => normalizeHex(c, ""))
    .filter(Boolean);
  const paletteList = [primary, secondary, soft, panel, accent, ...extras, "#FFFFFF"]
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .join(", ");

  const linkRules = `CRITICAL LINK RULES:
- You MUST NOT invent, guess, or fabricate any URLs.
- You may ONLY use these allowed links for <a href>:
${formatAllowedLinks(allowedLinks)}
- If no suitable link exists for a CTA, omit the button or use non-clickable text (no href).
- Image src attributes may ONLY use provided image/logo URLs: ${
    imageUrls.length || params.logoUrl
      ? [params.logoUrl, ...imageUrls].filter(Boolean).join(", ")
      : "none — do not add <img> tags with external URLs"
  }.`;

  const skeleton =
    !isEdit && templateId && !isPlain
      ? renderEmailTemplateSkeleton({
          templateId,
          companyName: params.companyName,
          logoUrl: params.logoUrl,
          palette: { primary, secondary, soft, panel, accent, extras },
          heroImageUrl: imageUrls[0] ?? null,
          mode: "ai",
          company: {
            companyName: params.companyName,
            logoUrl: params.logoUrl,
            phone: params.companyPhone,
            email: params.companyEmail,
            website: params.companyWebsite,
            address: params.companyAddress,
            city: params.companyCity,
            state: params.companyState,
            zip: params.companyZip,
          },
        })
      : null;

  const plainLinkRules = `CRITICAL LINK RULES:
- You MUST NOT invent, guess, or fabricate any URLs.
- You may ONLY include these allowed links, written as full URLs in the text:
${formatAllowedLinks(allowedLinks)}
- If no suitable link exists, mention the action in words without a URL.`;

  const system = isPlain
    ? isEdit
      ? `You are an expert email marketer for ${params.companyName}.
Brand voice: friendly, upbeat, and professional.
You will receive an EXISTING plain-text email and an edit request.
Return ONLY valid JSON with keys: subject, bodyText.
bodyText must be unformatted plain text — no HTML, no markdown, no tables, no CSS.
Apply the user's requested changes carefully. Keep line breaks readable.
${plainLinkRules}
Do not include markdown fences or extra commentary.`
      : `You are an expert email marketer for ${params.companyName}.
Brand voice: friendly, upbeat, and professional.
Return ONLY valid JSON with keys: subject, bodyText.
bodyText must be a complete unformatted plain-text email — no HTML, no markdown, no tables, no CSS, no signature, no unsubscribe line.
Start with Hey {customer_first_name}, then the body, with paragraphs separated by blank lines. Optional short sign-off like Thanks. The CRM adds company contact info and unsubscribe when sending.
${plainLinkRules}
Do not include markdown fences or extra commentary.`
    : isEdit
    ? `You are an expert email marketer and HTML email developer for ${params.companyName}.
Brand voice: friendly, upbeat, and professional.
Brand colors (use these hex values): primary ${primary}, secondary ${secondary}, soft ${soft}, panel ${panel}, accent ${accent}. Full palette: ${paletteList}.
You will receive EXISTING email HTML and an edit request.
Return ONLY valid JSON with keys: subject, bodyHtml.
bodyHtml must be the FULL updated email HTML (table-based, INLINE CSS only, email-client safe).
Apply the user's requested changes carefully. Preserve structure, tracking-friendly links, and branding unless the user asks otherwise.
When changing colors, prefer the brand palette above.
${linkRules}
Do not strip the document to a fragment if the input is a full HTML email — return a complete document.
Do not include markdown fences or extra commentary.`
    : `You are an expert email marketer for ${params.companyName}.
Brand voice: friendly, upbeat, and professional.
Brand colors (use these hex values): primary ${primary}, secondary ${secondary}, soft ${soft}, panel ${panel}, accent ${accent}. Full palette: ${paletteList}.
Return ONLY valid JSON with keys: subject, bodyHtml.
bodyHtml must be a complete responsive marketing email using table-based layout and INLINE CSS only (email-client safe).
Style CTA buttons with primary ${primary}. Use secondary ${secondary} for headers.
${
  skeleton
    ? `A TEMPLATE SKELETON is provided. Replace placeholders like {{HEADLINE}}, {{INTRO}}, {{BODY}}, {{BODY_2}}, {{OFFER}}, {{GREETING}}, {{CLOSING}}, {{CTA}}, {{FINE_PRINT}} with real content. Keep the overall layout and brand colors. Keep the signature/footer block (company name and contact info) unchanged. For {{CTA}}, output a centered table-based button using ONLY an allowed link URL (omit CTA entirely for letter templates).`
    : `Include: compelling headline, short paragraphs, one clear call-to-action button, and a footer with the company name plus phone, email, website, and address when provided.`
}
${linkRules}
Do not include markdown fences or extra commentary.`;

  const user = isPlain
    ? isEdit
      ? `Edit this plain-text marketing email for ${params.companyName}.
${params.subject ? `Current subject: ${params.subject}` : ""}

Edit request:
${params.prompt}

Existing text:
${existing}`
      : `Write a plain-text marketing email (no HTML).
Company: ${params.companyName}
${params.subject ? `Suggested subject: ${params.subject}` : ""}

Campaign brief:
${params.prompt}`
    : isEdit
    ? `Edit this marketing email for ${params.companyName}.
${params.subject ? `Current subject: ${params.subject}` : ""}

Edit request:
${params.prompt}

Existing HTML:
${existing}`
    : `Write a marketing email campaign.
Company: ${params.companyName}
${params.subject ? `Suggested subject: ${params.subject}` : ""}
Template: ${templateId ?? "freeform"}

Campaign brief:
${params.prompt}

${skeleton ? `Template skeleton HTML to fill in:\n${skeleton}` : ""}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: isEdit ? 4000 : 3500,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || "OpenAI request failed");
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error("No content from OpenAI");

  const parsed = JSON.parse(raw) as { subject?: string; bodyHtml?: string; bodyText?: string };
  const subject = parsed.subject ?? params.subject ?? "News from " + params.companyName;

    if (isPlain) {
    let bodyText = (parsed.bodyText ?? "").trim();
    if (!bodyText && parsed.bodyHtml) bodyText = htmlToPlainText(parsed.bodyHtml);
    if (!bodyText) throw new Error("AI returned empty email text");
    return { subject, bodyHtml: "", bodyText };
  }

  let bodyHtml = (parsed.bodyHtml ?? "").trim();
  if (!bodyHtml) throw new Error("AI returned empty HTML");

  bodyHtml = stripDisallowedHrefs(bodyHtml, allowedUrlSet);

  if (!isEdit && !looksLikeFullEmail(bodyHtml) && !skeleton) {
    bodyHtml = wrapBrandedEmail(bodyHtml, params, { primary, secondary });
  }

  return { subject, bodyHtml, bodyText: htmlToPlainText(bodyHtml) };
}

function looksLikeFullEmail(html: string) {
  return /<!DOCTYPE\s+html/i.test(html) || /<html[\s>]/i.test(html) || /<body[\s>]/i.test(html);
}

function wrapBrandedEmail(
  innerHtml: string,
  company: {
    companyName: string;
    companyPhone?: string | null;
    companyEmail?: string | null;
    companyWebsite?: string | null;
    companyAddress?: string | null;
    companyCity?: string | null;
    companyState?: string | null;
    companyZip?: string | null;
  },
  colors: { primary: string; secondary: string }
) {
  const logoUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}${stormBrand.logoPath}`;
  const signature = buildCompanySignatureHtml(
    {
      companyName: company.companyName,
      phone: company.companyPhone,
      supportEmail: company.companyEmail,
      website: company.companyWebsite,
      address: company.companyAddress,
      city: company.companyCity,
      state: company.companyState,
      zip: company.companyZip,
    },
    { align: "center" }
  );
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="background-color:${colors.secondary};padding:24px;text-align:center;">
              <img src="${logoUrl}" alt="${escapeAttr(company.companyName)}" width="180" style="max-width:180px;height:auto;" />
            </td>
          </tr>
          <tr>
            <td style="padding:32px 28px;color:#1e293b;font-size:16px;line-height:1.6;">
              ${innerHtml}
            </td>
          </tr>
          <tr>
            <td style="background-color:${colors.primary}22;padding:12px 28px 20px;">
              ${signature}
              <p style="margin:12px 0 0;font-size:12px;color:#64748b;text-align:center;">You're receiving this because you're a valued customer.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeAttr(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
