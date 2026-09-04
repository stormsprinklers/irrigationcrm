function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type ReceiptMediaItem = {
  id: string;
  fileName: string;
  mimeType: string;
};

export function receiptAttachmentPublicUrl(
  invoicePublicToken: string,
  attachmentId: string,
  publicBaseUrl?: string | null
) {
  const origin = (publicBaseUrl?.trim() || process.env.NEXT_PUBLIC_APP_URL || "").replace(
    /\/$/,
    ""
  );
  const path = `/api/public/invoices/${encodeURIComponent(invoicePublicToken)}/attachments/${encodeURIComponent(attachmentId)}`;
  return origin ? `${origin}${path}` : path;
}

export function buildPaidReceiptExtras(params: {
  workSummary: string | null;
  reviewUrl: string | null;
  invoicePublicToken: string;
  media: ReceiptMediaItem[];
  publicBaseUrl?: string | null;
}): { html: string; text: string } {
  const partsHtml: string[] = [];
  const partsText: string[] = [];

  if (params.workSummary) {
    partsHtml.push(
      `<div style="margin-top:20px"><p style="margin:0 0 8px;font-weight:600">Summary of work</p><p style="margin:0;white-space:pre-wrap">${escapeHtml(params.workSummary)}</p></div>`
    );
    partsText.push(`Summary of work:\n${params.workSummary}`);
  }

  const media = params.media.filter(
    (item) => item.mimeType.startsWith("image/") || item.mimeType.startsWith("video/")
  );
  if (media.length > 0) {
    const cards = media
      .slice(0, 12)
      .map((item) => {
        const url = receiptAttachmentPublicUrl(
          params.invoicePublicToken,
          item.id,
          params.publicBaseUrl
        );
        if (item.mimeType.startsWith("image/")) {
          return `<a href="${escapeHtml(url)}" style="display:block;margin:0 0 12px"><img src="${escapeHtml(url)}" alt="${escapeHtml(item.fileName)}" width="560" style="display:block;width:100%;max-width:560px;height:auto;border-radius:8px;border:1px solid #e5e7eb" /></a>`;
        }
        return `<p style="margin:0 0 12px"><a href="${escapeHtml(url)}" style="color:#1d4ed8">Watch video: ${escapeHtml(item.fileName)}</a></p>`;
      })
      .join("");
    partsHtml.push(
      `<div style="margin-top:20px"><p style="margin:0 0 12px;font-weight:600">Photos &amp; videos from the job</p>${cards}</div>`
    );
    partsText.push("Photos and videos from your visit are included in this email.");
  }

  if (params.reviewUrl) {
    partsHtml.push(
      `<div style="margin-top:24px"><a href="{review_link}" style="display:inline-block;background:#0f2744;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">Leave a review</a></div>`
    );
    partsText.push("Leave a review: {review_link}");
  }

  return {
    html: partsHtml.join(""),
    text: partsText.join("\n\n"),
  };
}
