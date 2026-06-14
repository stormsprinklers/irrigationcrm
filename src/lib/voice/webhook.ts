import { NextRequest } from "next/server";
import { validateTwilioSignature } from "@/lib/inbox/twilio";

export async function parseTwilioWebhook(request: NextRequest) {
  const formData = await request.formData();
  const params: Record<string, string> = {};
  formData.forEach((value, key) => {
    params[key] = String(value);
  });

  const signature = request.headers.get("x-twilio-signature") ?? "";
  if (
    process.env.TWILIO_AUTH_TOKEN &&
    !validateTwilioSignature(signature, request.url, params)
  ) {
    return null;
  }

  return params;
}
