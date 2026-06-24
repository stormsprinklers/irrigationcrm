import { NextRequest } from "next/server";
import { getTwilioWebhookUrl, validateTwilioSignature } from "@/lib/inbox/twilio";

export async function parseTwilioWebhook(request: NextRequest) {
  const formData = await request.formData();
  const params: Record<string, string> = {};
  formData.forEach((value, key) => {
    params[key] = String(value);
  });

  const signature = request.headers.get("x-twilio-signature") ?? "";
  const webhookUrl = getTwilioWebhookUrl(request);
  if (
    process.env.TWILIO_AUTH_TOKEN &&
    !validateTwilioSignature(signature, webhookUrl, params)
  ) {
    return null;
  }

  return params;
}
