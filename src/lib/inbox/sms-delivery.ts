/** Common Twilio SMS error codes → short CRM-facing explanations. */
const TWILIO_SMS_ERROR_HINTS: Record<string, string> = {
  "21211": "The destination phone number is invalid.",
  "21408": "Permission to send SMS to this region is not enabled on your Twilio account.",
  "21610": "This recipient has opted out (STOP) and cannot be texted until they opt back in.",
  "21612": "The “From” number is not SMS-capable, or SMS is not enabled for it on Twilio.",
  "21614": "The destination number is not a valid mobile number.",
  "30001": "Queue overflow — try again in a moment.",
  "30002": "Account suspended — check Twilio Console billing/account status.",
  "30003": "Unreachable destination handset.",
  "30004": "Message blocked by the carrier.",
  "30005": "Unknown destination handset.",
  "30006": "Landline or unreachable carrier — SMS may not be supported on this number.",
  "30007":
    "Carrier filtered the message (often A2P/10DLC, content, or unregistered campaign).",
  "30008": "Unknown delivery error from the carrier.",
  "30034":
    "US A2P 10DLC issue — the sending number may not be attached to an approved Messaging Service / campaign.",
};

export function isSmsNotDelivered(status: string | null | undefined) {
  const normalized = status?.toLowerCase();
  return normalized === "failed" || normalized === "undelivered";
}

export function formatSmsDeliveryFailure(params: {
  deliveryStatus?: string | null;
  deliveryErrorCode?: string | null;
  deliveryError?: string | null;
}): { title: string; detail: string; hint: string | null } {
  const status = params.deliveryStatus?.toLowerCase();
  const title =
    status === "undelivered" ? "Not delivered" : status === "failed" ? "Failed to send" : "Delivery problem";

  const code = params.deliveryErrorCode?.trim() || null;
  const raw = params.deliveryError?.trim() || null;
  const hint = code ? TWILIO_SMS_ERROR_HINTS[code] ?? null : null;

  const detailParts: string[] = [];
  if (raw) detailParts.push(raw);
  if (code) detailParts.push(`Twilio error ${code}`);
  if (!detailParts.length) {
    detailParts.push(
      status === "undelivered"
        ? "The carrier accepted the message but did not deliver it to the handset."
        : "Twilio reported that this message failed."
    );
  }

  return {
    title,
    detail: detailParts.join(" · "),
    hint,
  };
}
