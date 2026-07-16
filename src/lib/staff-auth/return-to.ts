/**
 * Allowlist destinations after password reset / forgot-password "back" links.
 * Relative paths stay on CRM; absolute URLs must match configured spoke origins.
 */
export function sanitizeAuthReturnTo(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const value = raw.trim();

  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) {
    return value;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  const allowedOrigins = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXTAUTH_URL,
    process.env.NEXT_PUBLIC_LMS_URL,
    process.env.LMS_INTEGRATION_URL,
    process.env.NEXT_PUBLIC_DESIGN_URL,
  ]
    .map((u) => {
      try {
        return u?.trim() ? new URL(u).origin : null;
      } catch {
        return null;
      }
    })
    .filter((o): o is string => Boolean(o));

  if (!allowedOrigins.includes(parsed.origin)) {
    return null;
  }

  return parsed.toString();
}

export function buildResetPasswordPath(token: string, returnTo?: string | null) {
  const params = new URLSearchParams({ token });
  const safe = sanitizeAuthReturnTo(returnTo);
  if (safe) params.set("returnTo", safe);
  return `/reset-password?${params.toString()}`;
}
