function normalizeBaseUrl(url: string) {
  return url.replace(/\/$/, "");
}

/** Public app base URL for webhooks, links, and Twilio callbacks. */
export function getAppBaseUrl(requestOrigin?: string | null) {
  const fromEnv =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.AUTH_URL ??
    process.env.NEXTAUTH_URL;

  if (fromEnv?.trim()) {
    return normalizeBaseUrl(fromEnv.trim());
  }

  if (requestOrigin?.trim()) {
    return normalizeBaseUrl(requestOrigin.trim());
  }

  return "http://localhost:3000";
}

export function twilioSmsStatusCallbackUrl(requestOrigin?: string | null) {
  return `${getAppBaseUrl(requestOrigin)}/api/twilio/sms/status`;
}
