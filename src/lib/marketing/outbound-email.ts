import { isHtmlEmailBody } from "@/lib/marketing/email-templates";
import { rewriteTrackedLinks, rewriteTrackedUrlsInText } from "@/lib/marketing/link-tracking";
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
    return { text };
  }

  const rawHtml = appendMarketingUnsubscribeFooter(
    params.bodyHtml ?? "",
    params.unsubscribeUrl
  );
  return {
    text,
    html: rewriteTrackedLinks(rawHtml, params.recipientId),
  };
}
