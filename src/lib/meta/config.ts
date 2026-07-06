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
      "Optional default App ID from Meta Developer Console. You can also enter App ID per company in Settings → Meta webhooks.",
  },
] as const;

export const META_CRM_SETTINGS = [
  {
    field: "Verify token",
    where: "Settings → Meta webhooks",
    description: "You generate this in the CRM; paste the same value in Meta as the webhook Verify Token.",
  },
  {
    field: "App Secret",
    where: "Settings → Meta webhooks",
    description: "From Meta App Dashboard → App settings → Basic. Stored per company (not in Vercel).",
  },
  {
    field: "App ID",
    where: "Settings → Meta webhooks",
    description: "From Meta App Dashboard → App settings → Basic.",
  },
  {
    field: "Facebook Page ID",
    where: "Settings → Meta webhooks",
    description: "Routes incoming webhook events to your company account.",
  },
  {
    field: "Meta access token",
    where: "Settings → Meta webhooks",
    description:
      "User token from Graph API Explorer (include pages_show_list and business_management for Business Suite pages). The CRM resolves the Page token automatically.",
  },
  {
    field: "Instagram account ID",
    where: "Settings → Meta webhooks",
    description: "Optional; use if Instagram webhooks use a different object ID.",
  },
] as const;

export const META_PUBLISH_PERMISSIONS = [
  "pages_manage_posts",
  "pages_read_engagement",
  "pages_read_user_content",
  "instagram_content_publish",
  "instagram_basic",
  "pages_show_list",
  "business_management",
  "read_insights",
] as const;

export const META_WEBHOOK_FIELDS = [
  { product: "Page", fields: ["messages", "messaging_postbacks", "message_echoes", "feed"] },
  { product: "Instagram", fields: ["messages", "messaging_postbacks", "message_echoes", "comments"] },
] as const;

export const META_ADS_PERMISSIONS = [
  "ads_read",
  "business_management",
  "pages_show_list",
] as const;

export const META_MESSAGING_PERMISSIONS = [
  "pages_messaging",
  "pages_manage_metadata",
  "instagram_manage_messages",
  "instagram_basic",
] as const;
