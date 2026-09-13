import { plainTextAsEmailHtml } from "@/lib/inbox/email";
import { isHtmlEmailBody, looksLikePlainEmail } from "@/lib/marketing/email-templates";
import {
  appendOpenTrackingPixel,
  rewriteTrackedLinks,
  rewriteTrackedUrlsInText,
} from "@/lib/marketing/link-tracking";
import {
  appendMarketingUnsubscribeFooter,
  appendMarketingUnsubscribeText,
  appendPlainUnsubscribeFooter,
  appendPlainUnsubscribeText,
} from "@/lib/marketing/unsubscribe";

/** Build the HTML and/or plain-text parts for a campaign send. */
export function buildMarketingEmailPayload(params: {
  bodyHtml: string | null | undefined;
  bodyText: string;
  unsubscribeUrl: string;
  recipientId: string;
  publicBaseUrl?: string | null;
}): { text: string; html?: string; unbranded: boolean } {
  const unbranded = looksLikePlainEmail(params.bodyHtml, params.bodyText);
  const text = rewriteTrackedUrlsInText(
    unbranded
      ? appendPlainUnsubscribeText(params.bodyText, params.unsubscribeUrl)
      : appendMarketingUnsubscribeText(params.bodyText, params.unsubscribeUrl),
    params.recipientId
  );

  if (unbranded) {
    const htmlSource = isHtmlEmailBody(params.bodyHtml)
      ? params.bodyHtml ?? ""
      : plainTextAsEmailHtml(params.bodyText);
    const html = appendPlainUnsubscribeFooter(htmlSource, params.unsubscribeUrl);
    return {
      text,
      unbranded: true,
      html: appendOpenTrackingPixel(
        /<a\s/i.test(html) ? rewriteTrackedLinks(html, params.recipientId) : html,
        params.recipientId
      ),
    };
  }

  const rawHtml = appendMarketingUnsubscribeFooter(params.bodyHtml ?? "", params.unsubscribeUrl);
  return {
    text,
    unbranded: false,
    html: appendOpenTrackingPixel(
      rewriteTrackedLinks(rawHtml, params.recipientId),
      params.recipientId
    ),
  };
}
