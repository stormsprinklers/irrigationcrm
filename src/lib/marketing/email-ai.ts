import { stormBrand } from "@/lib/branding";
import { requireOpenAIApiKey } from "@/lib/openai/client";
import { htmlToPlainText } from "@/lib/marketing/link-tracking";
import {
  isEmailTemplateId,
  renderEmailTemplateSkeleton,
  type EmailTemplateId,
} from "@/lib/marketing/email-templates";
import type { CampaignAllowedLink } from "@/lib/marketing/campaign-links";

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
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("mailto:")) {
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
  brandPalette?: EmailBrandPalette;
  templateId?: EmailTemplateId | string | null;
  allowedLinks?: CampaignAllowedLink[];
  imageUrls?: string[];
  logoUrl?: string | null;
  companyPhone?: string | null;
  companyEmail?: string | null;
  companyWebsite?: string | null;
}) {
  const apiKey = requireOpenAIApiKey();
  const existing = params.existingHtml?.trim() ?? "";
  const isEdit = Boolean(existing);
  const templateId = isEmailTemplateId(params.templateId) ? params.templateId : null;
  const allowedLinks = params.allowedLinks ?? [];
  const imageUrls = (params.imageUrls ?? []).filter(Boolean);
  const allowedUrlSet = new Set<string>([
    ...allowedLinks.map((l) => l.url),
    ...imageUrls,
    ...(params.logoUrl ? [params.logoUrl] : []),
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
    !isEdit && templateId
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
          },
        })
      : null;

  const system = isEdit
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
    ? `A TEMPLATE SKELETON is provided. Replace placeholders like {{HEADLINE}}, {{INTRO}}, {{BODY}}, {{BODY_2}}, {{OFFER}}, {{GREETING}}, {{CLOSING}}, {{CTA}}, {{FINE_PRINT}} with real content. Keep the overall layout and brand colors. For letter templates, keep the signature block (logo/company/contact) unchanged and write plain letter prose. For {{CTA}}, output a centered table-based button using ONLY an allowed link URL (omit CTA entirely for letter templates).`
    : `Include: compelling headline, short paragraphs, one clear call-to-action button, and a brief footer.`
}
${linkRules}
Do not include markdown fences or extra commentary.`;

  const user = isEdit
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

  const parsed = JSON.parse(raw) as { subject?: string; bodyHtml?: string };
  let bodyHtml = (parsed.bodyHtml ?? "").trim();
  if (!bodyHtml) throw new Error("AI returned empty HTML");

  bodyHtml = stripDisallowedHrefs(bodyHtml, allowedUrlSet);

  if (!isEdit && !looksLikeFullEmail(bodyHtml) && !skeleton) {
    bodyHtml = wrapBrandedEmail(bodyHtml, params.companyName, { primary, secondary });
  }

  const subject = parsed.subject ?? params.subject ?? "News from " + params.companyName;
  const bodyText = htmlToPlainText(bodyHtml);

  return { subject, bodyHtml, bodyText };
}

function looksLikeFullEmail(html: string) {
  return /<!DOCTYPE\s+html/i.test(html) || /<html[\s>]/i.test(html) || /<body[\s>]/i.test(html);
}

function wrapBrandedEmail(
  innerHtml: string,
  companyName: string,
  colors: { primary: string; secondary: string }
) {
  const logoUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}${stormBrand.logoPath}`;
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
              <img src="${logoUrl}" alt="${companyName}" width="180" style="max-width:180px;height:auto;" />
            </td>
          </tr>
          <tr>
            <td style="padding:32px 28px;color:#1e293b;font-size:16px;line-height:1.6;">
              ${innerHtml}
            </td>
          </tr>
          <tr>
            <td style="background-color:${colors.primary}22;padding:20px 28px;text-align:center;font-size:12px;color:#64748b;">
              <p style="margin:0 0 8px;">${companyName}</p>
              <p style="margin:0;">You're receiving this because you're a valued customer.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
