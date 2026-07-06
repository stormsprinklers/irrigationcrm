export type GoogleOAuthCredentials = {
  clientId: string;
  clientSecret: string;
};

/** OAuth client for Search Console, Google Ads, and other non-GBP integrations. */
export function getGeneralGoogleOAuthConfig(): GoogleOAuthCredentials {
  return {
    clientId:
      process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() ??
      process.env.GOOGLE_CLOUD_CLIENT_ID?.trim() ??
      "",
    clientSecret:
      process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() ??
      process.env.GOOGLE_CLOUD_CLIENT_SECRET?.trim() ??
      "",
  };
}

/** OAuth client for Google Business Profile. Falls back to general credentials if dedicated vars are unset. */
export function getGoogleBusinessOAuthConfig(): GoogleOAuthCredentials {
  const clientId = process.env.GOOGLE_BUSINESS_OAUTH_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.GOOGLE_BUSINESS_OAUTH_CLIENT_SECRET?.trim() ?? "";
  if (clientId && clientSecret) {
    return { clientId, clientSecret };
  }
  return getGeneralGoogleOAuthConfig();
}

export function isGeneralGoogleOAuthConfigured() {
  const { clientId, clientSecret } = getGeneralGoogleOAuthConfig();
  return Boolean(clientId && clientSecret);
}

export function isGoogleBusinessOAuthConfigured() {
  const { clientId, clientSecret } = getGoogleBusinessOAuthConfig();
  return Boolean(clientId && clientSecret);
}

export function usesDedicatedGoogleBusinessOAuthCredentials() {
  return Boolean(
    process.env.GOOGLE_BUSINESS_OAUTH_CLIENT_ID?.trim() &&
      process.env.GOOGLE_BUSINESS_OAUTH_CLIENT_SECRET?.trim()
  );
}
