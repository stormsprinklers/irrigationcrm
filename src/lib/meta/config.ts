import { getAppBaseUrl } from "@/lib/app-url";

/** Environment variables for Meta / Facebook / Instagram (Vercel). */
export function getMetaEnvConfig() {
  return {
    appUrl: process.env.NEXT_PUBLIC_APP_URL?.trim() || null,
    appId: process.env.META_APP_ID?.trim() || null,
    webhookPath: "/api/meta/webhook",
    callbackUrl: process.env.NEXT_PUBLIC_APP_URL?.trim()
      ? `${getAppBaseUrl()}/api/meta/webhook`
      : null,
  };
}

export const META_VERCEL_ENV_VARS = [
  {
    name: "NEXT_PUBLIC_APP_URL",
    required: true,
    description:
      "Public CRM URL (e.g. https://crm.stormsprinklers.com). Used for the Meta webhook callback.",
  },
  {
    name: "META_APP_ID",
    required: false,
    description:
      "Optional default App ID from Meta Developer Console. You can also enter App ID per company in Marketing → Social.",
  },
] as const;

export const META_CRM_SETTINGS = [
  {
    field: "Verify token",
    where: "Marketing → Social → Meta webhooks",
    description: "You generate this in the CRM; paste the same value in Meta as the webhook Verify Token.",
  },
  {
    field: "App Secret",
    where: "Marketing → Social → Meta webhooks",
    description: "From Meta App Dashboard → App settings → Basic. Stored per company (not in Vercel).",
  },
  {
    field: "App ID",
    where: "Marketing → Social → Meta webhooks",
    description: "From Meta App Dashboard → App settings → Basic.",
  },
  {
    field: "Facebook Page ID",
    where: "Marketing → Social → Meta webhooks",
    description: "Routes incoming webhook events to your company account.",
  },
  {
    field: "Instagram account ID",
    where: "Marketing → Social → Meta webhooks",
    description: "Optional; use if Instagram webhooks use a different object ID.",
  },
] as const;

export const META_WEBHOOK_FIELDS = [
  { product: "Page", fields: ["messages", "messaging_postbacks", "message_echoes", "feed"] },
  { product: "Instagram", fields: ["messages", "messaging_postbacks", "comments"] },
] as const;
