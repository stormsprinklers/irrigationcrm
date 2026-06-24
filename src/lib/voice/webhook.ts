import { NextRequest } from "next/server";
import { isValidTwilioWebhookRequest } from "@/lib/inbox/twilio";

export async function parseTwilioWebhook(request: NextRequest) {
  const formData = await request.formData();
  const params: Record<string, string> = {};
  formData.forEach((value, key) => {
    params[key] = String(value);
  });

  if (process.env.TWILIO_AUTH_TOKEN && !isValidTwilioWebhookRequest(request, params)) {
    return null;
  }

  return params;
}
