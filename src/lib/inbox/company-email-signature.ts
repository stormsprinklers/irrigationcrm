/** Marker so we do not append a second company signature block. */
export const COMPANY_SIGNATURE_ATTR = "data-storm-company-signature";

export type CompanySignatureFields = {
  companyName: string;
  phone?: string | null;
  supportEmail?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

export type CompanySignatureLine = {
  text: string;
  href?: string;
};

export function formatCompanySignatureAddress(fields: CompanySignatureFields): string {
  const line1 = fields.address?.trim() ?? "";
  const cityState = [fields.city?.trim(), fields.state?.trim()].filter(Boolean).join(", ");
  const cityStateZip = [cityState, fields.zip?.trim()].filter(Boolean).join(" ");
  return [line1, cityStateZip].filter(Boolean).join(", ");
}

function websiteHref(raw: string): string {
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function websiteLabel(raw: string): string {
  return raw.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

export function companySignatureContactLines(fields: CompanySignatureFields): CompanySignatureLine[] {
  const phone = fields.phone?.trim();
  const email = fields.supportEmail?.trim();
  const website = fields.website?.trim();
  const address = formatCompanySignatureAddress(fields);
  const lines: CompanySignatureLine[] = [];

  if (phone) {
    const tel = phone.replace(/[^\d+]/g, "");
    lines.push({ text: phone, href: tel ? `tel:${tel}` : undefined });
  }
  if (email) {
    lines.push({ text: email, href: `mailto:${email}` });
  }
  if (website) {
    lines.push({ text: websiteLabel(website), href: websiteHref(website) });
  }
  if (address) {
    lines.push({ text: address });
  }
  return lines;
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

export function htmlHasCompanySignature(html: string): boolean {
  return html.includes(COMPANY_SIGNATURE_ATTR);
}

export function buildCompanySignatureHtml(
  fields: CompanySignatureFields,
  options?: { align?: "left" | "center"; includeName?: boolean }
): string {
  const align = options?.align ?? "left";
  const includeName = options?.includeName !== false;
  const name = fields.companyName.trim();
  const lines = companySignatureContactLines(fields);
  const textAlign = align === "center" ? "center" : "left";
  const lineHtml = lines
    .map((line) => {
      const inner = line.href
        ? `<a href="${escapeAttr(line.href)}" style="color:#64748b;text-decoration:none">${escapeHtml(line.text)}</a>`
        : escapeHtml(line.text);
      return `<p style="margin:0 0 2px;font-size:13px;line-height:1.5;color:#64748b">${inner}</p>`;
    })
    .join("");

  return `<div ${COMPANY_SIGNATURE_ATTR}="true" style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;text-align:${textAlign}">
    ${
      includeName
        ? `<p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#111827">${escapeHtml(name)}</p>`
        : ""
    }
    ${lineHtml}
  </div>`;
}

export function buildCompanySignatureText(fields: CompanySignatureFields): string {
  return [fields.companyName.trim(), ...companySignatureContactLines(fields).map((line) => line.text)]
    .filter(Boolean)
    .join("\n");
}

export function applyCompanyEmailSignature(html: string, fields: CompanySignatureFields): string {
  if (htmlHasCompanySignature(html)) return html;
  const signatureHtml = buildCompanySignatureHtml(fields);
  const prefsBlock = html.match(
    /<div[^>]*>[\s\S]*?Manage (?:email|messaging) preferences[\s\S]*?<\/div>/i
  );
  if (prefsBlock?.index != null) {
    return html.slice(0, prefsBlock.index) + signatureHtml + html.slice(prefsBlock.index);
  }
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${signatureHtml}</body>`);
  }
  return `${html}${signatureHtml}`;
}

export function applyCompanyEmailSignatureText(
  text: string | undefined,
  fields: CompanySignatureFields
): string | undefined {
  const signature = buildCompanySignatureText(fields);
  if (!signature.trim()) return text;
  const existing = (text ?? "").trim();
  if (!existing) return signature;

  const phone = fields.phone?.trim();
  const email = fields.supportEmail?.trim();
  const tail = existing.slice(-800);
  if (phone && tail.includes(phone)) return existing;
  if (email && tail.includes(email)) return existing;
  if (existing.includes(signature)) return existing;
  return `${existing}\n\n${signature}`;
}
