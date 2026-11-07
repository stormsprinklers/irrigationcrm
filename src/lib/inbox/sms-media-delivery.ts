import { canAccessBlobPath, isBlobStorageUrl } from "@/lib/blob/urls";
import {
  isVideoMimeType,
  shouldSendSmsMediaAsLink,
  type PendingAttachment,
} from "@/lib/inbox/attachments";
import { pathnameFromBlobUrl, twilioAccessibleMediaUrl } from "@/lib/inbox/media-url";

const CUSTOMER_MEDIA_LINK_TTL_SECONDS = 30 * 24 * 60 * 60;

function externalUrl(
  item: PendingAttachment,
  pathname: string | null,
  publicBaseUrl?: string | null
) {
  if (pathname) {
    return twilioAccessibleMediaUrl(pathname, CUSTOMER_MEDIA_LINK_TTL_SECONDS, publicBaseUrl);
  }
  return item.publicUrl ?? item.blobUrl;
}

export function prepareSmsMediaDelivery(params: {
  companyId: string;
  body: string;
  media: PendingAttachment[];
  publicBaseUrl?: string | null;
}) {
  const mediaUrls: string[] = [];
  const linkLines: string[] = [];

  for (const item of params.media) {
    const pathname = isBlobStorageUrl(item.blobUrl)
      ? pathnameFromBlobUrl(item.blobUrl)
      : null;
    if (pathname && !canAccessBlobPath(params.companyId, pathname)) {
      throw new Error("SMS attachment does not belong to this company");
    }

    if (shouldSendSmsMediaAsLink(item)) {
      const url = externalUrl(item, pathname, params.publicBaseUrl);
      const label = isVideoMimeType(item.mimeType) ? "View video" : "View attachment";
      linkLines.push(`${label}: ${url}`);
      continue;
    }

    if (pathname) {
      mediaUrls.push(twilioAccessibleMediaUrl(pathname, 3600, params.publicBaseUrl));
    } else if (item.publicUrl?.includes("/api/twilio/mms/media")) {
      mediaUrls.push(item.publicUrl);
    } else if (item.publicUrl && !isBlobStorageUrl(item.publicUrl)) {
      mediaUrls.push(item.publicUrl);
    } else {
      mediaUrls.push(item.publicUrl ?? item.blobUrl);
    }
  }

  return {
    body: [params.body.trim(), ...linkLines].filter(Boolean).join("\n\n"),
    mediaUrls: mediaUrls.filter(Boolean),
    linkCount: linkLines.length,
  };
}
