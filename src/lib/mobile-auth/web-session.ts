import { encode } from "next-auth/jwt";
import { getAuthSecret } from "@/lib/auth-secret";
import type { SessionUser } from "@/lib/api-auth";

export const MOBILE_WEB_SESSION_SECONDS = 15 * 60;

/** Use Auth.js's encrypted session cookie, never put mobile credentials in URLs. */
export async function createMobileWebSession(user: SessionUser, secure: boolean) {
  const secret = getAuthSecret();
  if (!secret) throw new Error("Auth secret is not configured");
  const cookieName = `${secure ? "__Secure-" : ""}authjs.session-token`;
  const sessionToken = await encode({
    secret,
    salt: cookieName,
    maxAge: MOBILE_WEB_SESSION_SECONDS,
    token: {
      sub: user.id,
      id: user.id,
      email: user.email,
      name: user.name,
      companyId: user.companyId,
      role: user.role,
      mobileWebExpiresAt: Math.floor(Date.now() / 1000) + MOBILE_WEB_SESSION_SECONDS,
    },
  });
  return { sessionToken, cookieName, expiresIn: MOBILE_WEB_SESSION_SECONDS };
}
