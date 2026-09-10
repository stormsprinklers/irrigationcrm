import { isHtmlEmailBody } from "@/lib/marketing/email-templates";
import { rewriteTrackedLinks } from "@/lib/marketing/link-tracking";
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
  if (!isHtmlEmailBody(params.bodyHtml)) {
    return {
      text: appendMarketingUnsubscribeText(params.bodyText, params.unsubscribeUrl),
    };
  }

  const rawHtml = appendMarketingUnsubscribeFooter(
    params.bodyHtml ?? "",
    params.unsubscribeUrl
  );
  return {
    text: appendMarketingUnsubscribeText(params.bodyText, params.unsubscribeUrl),
    html: rewriteTrackedLinks(rawHtml, params.recipientId, params.publicBaseUrl),
  };
}
