import { stormBrand } from "@/lib/branding";
import { requireOpenAIApiKey } from "@/lib/openai/client";
import { htmlToPlainText } from "@/lib/marketing/link-tracking";

export async function generateCampaignEmail(params: {
  prompt: string;
  subject?: string;
  companyName: string;
  ctaUrl?: string;
}) {
  const apiKey = requireOpenAIApiKey();

  const system = `You are an expert email marketer for ${params.companyName}, an irrigation and sprinkler company.
Brand voice: friendly, upbeat, and professional.
Brand colors: navy ${stormBrand.navy}, sky blue ${stormBrand.sky}, coral accent ${stormBrand.coral}, ice ${stormBrand.ice}.
Return ONLY valid JSON with keys: subject, bodyHtml.
bodyHtml must be a complete responsive marketing email using table-based layout and INLINE CSS only (email-client safe).
Include: compelling headline, short paragraphs, one clear call-to-action button styled with brand sky blue, and a brief footer.
Do not include markdown fences or extra commentary.`;

  const user = `Write a marketing email campaign.
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
      max_tokens: 2500,
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
  const innerHtml = parsed.bodyHtml ?? "";
  const bodyHtml = wrapBrandedEmail(innerHtml, params.companyName);
  const subject = parsed.subject ?? params.subject ?? "News from " + params.companyName;
  const bodyText = htmlToPlainText(bodyHtml);

  return { subject, bodyHtml, bodyText };
}

function wrapBrandedEmail(innerHtml: string, companyName: string) {
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
            <td style="background-color:${stormBrand.navy};padding:24px;text-align:center;">
              <img src="${logoUrl}" alt="${companyName}" width="180" style="max-width:180px;height:auto;" />
            </td>
          </tr>
          <tr>
            <td style="padding:32px 28px;color:#1e293b;font-size:16px;line-height:1.6;">
              ${innerHtml}
            </td>
          </tr>
          <tr>
            <td style="background-color:${stormBrand.ice};padding:20px 28px;text-align:center;font-size:12px;color:#64748b;">
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
