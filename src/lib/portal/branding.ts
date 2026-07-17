import { absolutePublicBlobUrl, blobProxyUrl } from "@/lib/blob/urls";

/** Resolve logo URL for the customer portal header. */
export function resolvePortalLogoUrl(emailLogoUrl: string | null | undefined): string | null {
  if (emailLogoUrl?.trim()) {
    return (
      absolutePublicBlobUrl(emailLogoUrl) ??
      blobProxyUrl(emailLogoUrl) ??
      emailLogoUrl.trim()
    );
  }
  const website = process.env.NEXT_PUBLIC_WEBSITE_URL?.replace(/\/$/, "");
  if (website) return `${website}/logo.png`;
  return null;
}
