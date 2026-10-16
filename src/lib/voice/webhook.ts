import { NextRequest } from "next/server";
import { isValidTwilioWebhookRequest } from "@/lib/inbox/twilio";

export async function parseTwilioWebhook(request: NextRequest) {
  const formData = await request.formData();
  const params: Record<string, string> = {};
  formData.forEach((value, key) => {
    params[key] = String(value);
  });

  // Trusted telephony callbacks must fail closed. An unset secret is not an
  // authentication bypass; deployment validation also flags this condition.
  if (!process.env.TWILIO_AUTH_TOKEN || !isValidTwilioWebhookRequest(request, params)) {
    return null;
  }

  return params;
}
