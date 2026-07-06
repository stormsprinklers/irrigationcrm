import { createHmac, timingSafeEqual } from "crypto";
import type { GoogleOAuthCredentials } from "@/lib/google-oauth/config";

function oauthStateSecret() {
  const secret =
    process.env.GOOGLE_OAUTH_STATE_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "GOOGLE_OAUTH_STATE_SECRET or NEXTAUTH_SECRET must be set for Google OAuth"
    );
  }
  return secret;
}

export function createOAuthState(companyId: string) {
  const ts = Date.now();
  const sig = createHmac("sha256", oauthStateSecret())
    .update(`${companyId}:${ts}`)
    .digest("hex");
  return Buffer.from(JSON.stringify({ companyId, ts, sig })).toString("base64url");
}

export function verifyOAuthState(state: string, maxAgeMs = 15 * 60 * 1000) {
  try {
    const parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as {
      companyId: string;
      ts: number;
      sig: string;
    };
    if (!parsed.companyId || !parsed.ts || !parsed.sig) return null;
    if (Date.now() - parsed.ts > maxAgeMs) return null;

    const expected = createHmac("sha256", oauthStateSecret())
      .update(`${parsed.companyId}:${parsed.ts}`)
      .digest("hex");

    const a = Buffer.from(parsed.sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    return parsed.companyId;
  } catch {
    return null;
  }
}

export async function exchangeGoogleOAuthCode(
  code: string,
  redirectUri: string,
  credentials: GoogleOAuthCredentials,
  errorClass: new (message: string, status?: number) => Error = Error
) {
  const { clientId, clientSecret } = credentials;
  if (!clientId || !clientSecret) {
    throw new errorClass("Google OAuth is not configured", 503);
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !data.access_token) {
    throw new errorClass(
      data.error_description ?? data.error ?? "OAuth token exchange failed",
      res.status
    );
  }

  return data;
}
