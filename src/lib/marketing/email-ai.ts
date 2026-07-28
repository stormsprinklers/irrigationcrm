import { stormBrand } from "@/lib/branding";
import { requireOpenAIApiKey } from "@/lib/openai/client";
import { htmlToPlainText } from "@/lib/marketing/link-tracking";

export type EmailBrandPalette = {
  /** Main CTA / accent */
  primary: string;
  /** Headers / dark text backgrounds */
  secondary: string;
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

export async function generateCampaignEmail(params: {
  prompt: string;
  subject?: string;
  companyName: string;
  ctaUrl?: string;
  /** When set, AI revises this HTML instead of generating from scratch. */
  existingHtml?: string;
  brandPalette?: EmailBrandPalette;
}) {
  const apiKey = requireOpenAIApiKey();
  const existing = params.existingHtml?.trim() ?? "";
  const isEdit = Boolean(existing);

  const primary = normalizeHex(params.brandPalette?.primary, stormBrand.sky);
  const secondary = normalizeHex(params.brandPalette?.secondary, stormBrand.navy);
  const extras = (params.brandPalette?.extras ?? [])
    .map((c) => normalizeHex(c, ""))
    .filter(Boolean);
  const paletteList = [primary, secondary, ...extras, "#FFFFFF"]
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .join(", ");

  const system = isEdit
    ? `You are an expert email marketer and HTML email developer for ${params.companyName}.
Brand voice: friendly, upbeat, and professional.
Brand colors (use these hex values): primary ${primary}, secondary ${secondary}${extras.length ? `, extras ${extras.join(", ")}` : ""}. Full palette: ${paletteList}.
You will receive EXISTING email HTML and an edit request.
Return ONLY valid JSON with keys: subject, bodyHtml.
bodyHtml must be the FULL updated email HTML (table-based, INLINE CSS only, email-client safe).
Apply the user's requested changes carefully. Preserve structure, tracking-friendly links, and branding unless the user asks otherwise.
When changing colors, prefer the brand palette above.
Do not strip the document to a fragment if the input is a full HTML email — return a complete document.
Do not include markdown fences or extra commentary.`
    : `You are an expert email marketer for ${params.companyName}.
Brand voice: friendly, upbeat, and professional.
Brand colors (use these hex values): primary ${primary}, secondary ${secondary}${extras.length ? `, extras ${extras.join(", ")}` : ""}. Full palette: ${paletteList}.
Return ONLY valid JSON with keys: subject, bodyHtml.
bodyHtml must be a complete responsive marketing email using table-based layout and INLINE CSS only (email-client safe).
Include: compelling headline, short paragraphs, one clear call-to-action button styled with primary ${primary}, and a brief footer using secondary ${secondary}.
Do not include markdown fences or extra commentary.`;

  const user = isEdit
    ? `Edit this marketing email for ${params.companyName}.
${params.subject ? `Current subject: ${params.subject}` : ""}
${params.ctaUrl ? `Preferred CTA link if needed: ${params.ctaUrl}` : ""}

Edit request:
${params.prompt}

Existing HTML:
${existing}`
    : `Write a marketing email campaign.
Company: ${params.companyName}
${params.subject ? `Suggested subject: ${params.subject}` : ""}
${params.ctaUrl ? `Primary CTA link: ${params.ctaUrl}` : ""}

Campaign brief:
${params.prompt}`;

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
      max_tokens: isEdit ? 4000 : 2500,
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

  if (!isEdit && !looksLikeFullEmail(bodyHtml)) {
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
