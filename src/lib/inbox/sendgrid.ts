import crypto from "crypto";
import sgMail from "@sendgrid/mail";

export function getSendGridClient() {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    throw new Error("SendGrid API key not configured");
  }
  sgMail.setApiKey(apiKey);
  return sgMail;
}

export async function sendEmail(params: {
  from: string;
  to: string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
}) {
  const client = getSendGridClient();
  const [response] = await client.send({
    from: params.from,
    to: params.to,
    subject: params.subject,
    text: params.text ?? params.html ?? "",
    ...(params.html ? { html: params.html } : {}),
    ...(params.replyTo ? { replyTo: params.replyTo } : {}),
  });
  return response;
}

export function validateSendGridWebhook(
  payload: string,
  signature: string,
  timestamp: string
) {
  const secret = process.env.SENDGRID_WEBHOOK_SECRET;
  if (!secret) return true;

  const timestampPayload = timestamp + payload;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(timestampPayload)
    .digest("base64");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signature)
    );
  } catch {
    return false;
  }
}
