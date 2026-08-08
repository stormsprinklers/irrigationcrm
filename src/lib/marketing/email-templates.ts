import type { BrandPalette } from "@/lib/brand-palette";
import { contrastForeground, mixWithWhite, normalizeHex } from "@/lib/brand-palette";
import { stormBrand } from "@/lib/branding";

export const EMAIL_TEMPLATE_IDS = ["announcement", "offer", "letter"] as const;
export type EmailTemplateId = (typeof EMAIL_TEMPLATE_IDS)[number];

export function isEmailTemplateId(value: unknown): value is EmailTemplateId {
  return typeof value === "string" && (EMAIL_TEMPLATE_IDS as readonly string[]).includes(value);
}

export type EmailTemplateMeta = {
  id: EmailTemplateId;
  name: string;
  description: string;
};

export const EMAIL_TEMPLATES: EmailTemplateMeta[] = [
  {
    id: "announcement",
    name: "Announcement",
    description: "Header, short body, and one clear CTA — great for news and updates.",
  },
  {
    id: "offer",
    name: "Offer / promo",
    description: "Hero, offer callout, CTA, and fine print for deals and seasonal promos.",
  },
  {
    id: "letter",
    name: "Letter to homeowner",
    description: "Simple plain letter with a signature block (logo, company name, contact info).",
  },
];

type TemplateColors = {
  primary: string;
  secondary: string;
  soft: string;
  panel: string;
  accent: string;
  onPrimary: string;
  onSecondary: string;
};

export type EmailTemplateCompanyInfo = {
  companyName: string;
  logoUrl?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
};

function colorsFromPalette(palette?: Partial<BrandPalette> | null): TemplateColors {
  const primary = normalizeHex(palette?.primary, stormBrand.sky);
  const secondary = normalizeHex(palette?.secondary, stormBrand.navy);
  const soft = normalizeHex(palette?.soft, stormBrand.ice);
  const panel = normalizeHex(palette?.panel, "#E8F4FA");
  const accent = normalizeHex(palette?.accent ?? undefined, stormBrand.coral);
  return {
    primary,
    secondary,
    soft,
    panel,
    accent,
    onPrimary: contrastForeground(primary),
    onSecondary: contrastForeground(secondary),
  };
}

const EMPTY = "&nbsp;";

function emptyBlock(tag: "h1" | "p", style: string) {
  return `<${tag} style="${style}" data-placeholder="true">${EMPTY}</${tag}>`;
}

/** Layout-only skeleton for the live preview (no CTA buttons, empty text areas). */
export function renderEmailTemplatePreview(params: {
  templateId: EmailTemplateId;
  company: EmailTemplateCompanyInfo;
  palette?: Partial<BrandPalette> | null;
  heroImageUrl?: string | null;
}): string {
  return renderEmailTemplateSkeleton({
    ...params,
    companyName: params.company.companyName,
    logoUrl: params.company.logoUrl,
    mode: "preview",
    company: params.company,
  });
}

/** Skeleton for AI fill-in (includes placeholders / optional CTA slot). */
export function renderEmailTemplateSkeleton(params: {
  templateId: EmailTemplateId;
  companyName: string;
  logoUrl?: string | null;
  palette?: Partial<BrandPalette> | null;
  heroImageUrl?: string | null;
  mode?: "preview" | "ai";
  company?: EmailTemplateCompanyInfo;
}): string {
  const mode = params.mode ?? "ai";
  const isPreview = mode === "preview";
  const c = colorsFromPalette(params.palette);
  const logo = params.logoUrl?.trim() ?? params.company?.logoUrl?.trim();
  const hero = params.heroImageUrl?.trim();
  const companyName = params.company?.companyName ?? params.companyName;
  const lightBg = mixWithWhite(c.primary, 0.92);

  const logoBlock = logo
    ? `<img src="${escapeAttr(logo)}" alt="${escapeAttr(companyName)}" width="160" style="max-width:160px;height:auto;display:block;margin:0 auto;" />`
    : `<div style="font-size:20px;font-weight:700;color:${c.onSecondary};">${escapeHtml(companyName)}</div>`;

  const heroBlock = hero
    ? `<tr><td style="padding:0;"><img src="${escapeAttr(hero)}" alt="" width="600" style="width:100%;max-width:600px;height:auto;display:block;" /></td></tr>`
    : "";

  const ctaSlot = isPreview
    ? ""
    : `{{CTA}}`;

  if (params.templateId === "offer") {
    return wrapShell(
      companyName,
      `
      <tr><td style="background-color:${c.secondary};padding:28px 24px;text-align:center;">${logoBlock}</td></tr>
      ${heroBlock}
      <tr>
        <td style="padding:32px 28px;background:#ffffff;">
          ${
            isPreview
              ? emptyBlock("h1", `margin:0 0 12px;font-size:26px;line-height:1.25;color:${c.secondary};min-height:1.2em;`)
              : `<h1 style="margin:0 0 12px;font-size:26px;line-height:1.25;color:${c.secondary};">{{HEADLINE}}</h1>`
          }
          ${
            isPreview
              ? emptyBlock("p", "margin:0 0 20px;font-size:16px;line-height:1.6;color:#334155;min-height:3em;")
              : `<p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#334155;">{{INTRO}}</p>`
          }
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:${c.panel};border-radius:8px;">
            <tr>
              <td style="padding:20px 18px;text-align:center;">
                <p style="margin:0 0 6px;font-size:13px;letter-spacing:0.04em;text-transform:uppercase;color:${c.secondary};font-weight:700;">Special offer</p>
                ${
                  isPreview
                    ? emptyBlock("p", `margin:0;font-size:22px;font-weight:700;color:${c.accent};min-height:1.2em;`)
                    : `<p style="margin:0;font-size:22px;font-weight:700;color:${c.accent};">{{OFFER}}</p>`
                }
              </td>
            </tr>
          </table>
          ${
            isPreview
              ? emptyBlock("p", "margin:0 0 24px;font-size:15px;line-height:1.6;color:#475569;min-height:3em;")
              : `<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#475569;">{{BODY}}</p>`
          }
          ${ctaSlot}
          ${
            isPreview
              ? emptyBlock("p", "margin:20px 0 0;font-size:12px;line-height:1.5;color:#94a3b8;min-height:1em;")
              : `<p style="margin:20px 0 0;font-size:12px;line-height:1.5;color:#94a3b8;">{{FINE_PRINT}}</p>`
          }
        </td>
      </tr>
      `
    );
  }

  if (params.templateId === "letter") {
    const phone = params.company?.phone?.trim() || "";
    const email = params.company?.email?.trim() || "";
    const website = params.company?.website?.trim() || "";
    const contactLines = [phone, email, website].filter(Boolean);
    const sigLogo = logo
      ? `<img src="${escapeAttr(logo)}" alt="${escapeAttr(companyName)}" width="120" style="max-width:120px;height:auto;display:block;margin:0 0 10px;" />`
      : "";

    return wrapShell(
      companyName,
      `
      <tr>
        <td style="padding:36px 40px;background:#ffffff;font-family:Georgia,'Times New Roman',serif;color:#1e293b;">
          ${
            isPreview
              ? emptyBlock(
                  "p",
                  "margin:0 0 18px;font-size:16px;line-height:1.7;font-family:Georgia,'Times New Roman',serif;min-height:1.2em;"
                )
              : `<p style="margin:0 0 18px;font-size:16px;line-height:1.7;font-family:Georgia,'Times New Roman',serif;">{{GREETING}}</p>`
          }
          ${
            isPreview
              ? `${emptyBlock("p", "margin:0 0 14px;font-size:16px;line-height:1.7;font-family:Georgia,'Times New Roman',serif;min-height:4em;")}`
              : `<p style="margin:0 0 14px;font-size:16px;line-height:1.7;font-family:Georgia,'Times New Roman',serif;">{{BODY}}</p>
          <p style="margin:0 0 14px;font-size:16px;line-height:1.7;font-family:Georgia,'Times New Roman',serif;">{{BODY_2}}</p>`
          }
          ${
            isPreview
              ? emptyBlock(
                  "p",
                  "margin:24px 0 0;font-size:16px;line-height:1.7;font-family:Georgia,'Times New Roman',serif;min-height:1.2em;"
                )
              : `<p style="margin:24px 0 0;font-size:16px;line-height:1.7;font-family:Georgia,'Times New Roman',serif;">{{CLOSING}}</p>`
          }
          <div style="margin-top:28px;padding-top:20px;border-top:1px solid #e2e8f0;font-family:Arial,Helvetica,sans-serif;">
            ${sigLogo}
            <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:${c.secondary};">${escapeHtml(companyName)}</p>
            ${contactLines
              .map(
                (line) =>
                  `<p style="margin:0 0 2px;font-size:13px;line-height:1.5;color:#64748b;">${escapeHtml(line)}</p>`
              )
              .join("")}
          </div>
        </td>
      </tr>
      `
    );
  }

  // announcement
  return wrapShell(
    companyName,
    `
    <tr><td style="background-color:${c.secondary};padding:28px 24px;text-align:center;">${logoBlock}</td></tr>
    ${heroBlock}
    <tr>
      <td style="padding:32px 28px;background:#ffffff;">
        <div style="height:4px;width:48px;background:${c.primary};margin:0 0 18px;border-radius:2px;"></div>
        ${
          isPreview
            ? emptyBlock("h1", `margin:0 0 14px;font-size:24px;line-height:1.3;color:${c.secondary};min-height:1.2em;`)
            : `<h1 style="margin:0 0 14px;font-size:24px;line-height:1.3;color:${c.secondary};">{{HEADLINE}}</h1>`
        }
        ${
          isPreview
            ? emptyBlock("p", "margin:0 0 16px;font-size:16px;line-height:1.65;color:#334155;min-height:2.5em;")
            : `<p style="margin:0 0 16px;font-size:16px;line-height:1.65;color:#334155;">{{INTRO}}</p>`
        }
        ${
          isPreview
            ? emptyBlock("p", "margin:0 0 24px;font-size:16px;line-height:1.65;color:#334155;min-height:3em;")
            : `<p style="margin:0 0 24px;font-size:16px;line-height:1.65;color:#334155;">{{BODY}}</p>`
        }
        ${ctaSlot}
      </td>
    </tr>
    <tr>
      <td style="padding:18px 28px;background:${lightBg};text-align:center;font-size:12px;color:#64748b;">
        <p style="margin:0;">${escapeHtml(companyName)}</p>
      </td>
    </tr>
    `
  );
}

function wrapShell(companyName: string, innerRows: string) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">
          ${innerRows}
        </table>
        <p style="margin:16px 0 0;font-size:11px;color:#94a3b8;">${escapeHtml(companyName)}</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function ctaButtonHtml(params: {
  label: string;
  url: string;
  primary: string;
  onPrimary?: string;
}) {
  const onPrimary = params.onPrimary ?? contrastForeground(params.primary);
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
  <tr>
    <td style="border-radius:6px;background-color:${params.primary};">
      <a href="${escapeAttr(params.url)}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:${onPrimary};text-decoration:none;border-radius:6px;">${escapeHtml(params.label)}</a>
    </td>
  </tr>
</table>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value: string) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
