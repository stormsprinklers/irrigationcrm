import { plainTextAsEmailHtml } from "@/lib/inbox/email";
import { isHtmlEmailBody } from "@/lib/marketing/email-templates";
import {
  appendOpenTrackingPixel,
  rewriteTrackedLinks,
  rewriteTrackedUrlsInText,
} from "@/lib/marketing/link-tracking";
import {
  appendMarketingUnsubscribeFooter,
  appendMarketingUnsubscribeText,
} from "@/lib/marketing/unsubscribe";

/** Build the HTML and/or plain-text parts for a campaign send. */
export function buildMarketingEmailPayload(params: {
  bodyHtml: string | null | undefined;
  bodyText: string;
  unsubscribeUrl: string;
  recipientId: string;
  publicBaseUrl?: string | null;
}): { text: string; html?: string } {
  const text = rewriteTrackedUrlsInText(
    appendMarketingUnsubscribeText(params.bodyText, params.unsubscribeUrl),
    params.recipientId
  );
  if (!isHtmlEmailBody(params.bodyHtml)) {
    return {
      text,
      html: appendOpenTrackingPixel(plainTextAsEmailHtml(text), params.recipientId),
    };
  }

  const rawHtml = appendMarketingUnsubscribeFooter(
    params.bodyHtml ?? "",
    params.unsubscribeUrl
  );
  return {
    text,
    html: appendOpenTrackingPixel(rewriteTrackedLinks(rawHtml, params.recipientId), params.recipientId),
  };
}
