import { absolutePublicBlobUrl } from "@/lib/blob/urls";
import { parseEmailAddress } from "@/lib/inbox/email-branding";

/** Extract the organizational domain from the outbound From address. */
export function domainFromSendgridFrom(sendgridFrom: string | null | undefined): string | null {
  if (!sendgridFrom?.trim()) return null;
  const { address } = parseEmailAddress(sendgridFrom);
  const at = address.lastIndexOf("@");
  if (at < 0) return null;
  const domain = address.slice(at + 1).trim().toLowerCase();
  return domain || null;
}

export function bimiDnsHost(domain: string) {
  return `default._bimi.${domain}`;
}

/** Build the BIMI TXT record value using publicly fetchable asset URLs. */
export function buildBimiTxtRecord(params: {
  bimiLogoUrl: string | null | undefined;
  bimiCertificateUrl?: string | null | undefined;
}): string | null {
  const logoUrl = absolutePublicBlobUrl(params.bimiLogoUrl);
  if (!logoUrl || !/^https:\/\//i.test(logoUrl)) return null;

  let value = `v=BIMI1; l=${logoUrl};`;
  const certUrl = absolutePublicBlobUrl(params.bimiCertificateUrl);
  if (certUrl && /^https:\/\//i.test(certUrl)) {
    value += ` a=${certUrl};`;
  }
  return value;
}
