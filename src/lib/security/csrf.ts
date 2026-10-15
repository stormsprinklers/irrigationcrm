import { NextResponse } from "next/server";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const MACHINE_ENDPOINT_PREFIXES = [
  "/api/auth/",
  "/api/ai/receptionist/",
  "/api/cron/",
  "/api/integrations/",
  "/api/meta/",
  "/api/mobile/",
  "/api/sendgrid/",
  "/api/stripe/",
  "/api/twilio/",
  "/api/marketing/track/",
  "/api/marketing/unsubscribe/",
  "/api/public/",
  "/api/book/public/",
  "/api/book/hiring/",
  "/api/refer/",
];

function configuredOrigins(request: Request): Set<string> {
  const origins = new Set<string>([new URL(request.url).origin]);
  for (const raw of [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXTAUTH_URL,
    process.env.CUSTOMER_BASE_URL,
  ]) {
    if (!raw?.trim()) continue;
    try {
      origins.add(new URL(raw).origin);
    } catch {
      // Invalid deployment configuration must not broaden the allowlist.
    }
  }
  return origins;
}

export function requiresBrowserMutationProtection(request: Request): boolean {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return false;
  const pathname = new URL(request.url).pathname;
  if (!pathname.startsWith("/api/")) return false;
  if (request.headers.has("authorization")) return false;
  return !MACHINE_ENDPOINT_PREFIXES.some(
    (prefix) => pathname === prefix.slice(0, -1) || pathname.startsWith(prefix)
  );
}

/**
 * Reject cross-site browser mutations before cookie-authenticated handlers run.
 * Requests without browser Origin/Fetch-Metadata headers remain available to
 * same-environment server code; provider and bearer endpoints are excluded.
 */
export function enforceBrowserMutationOrigin(request: Request): NextResponse | null {
  if (!requiresBrowserMutationProtection(request)) return null;

  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite === "cross-site") {
    return NextResponse.json({ error: "Cross-site request denied" }, { status: 403 });
  }

  const origin = request.headers.get("origin");
  if (origin) {
    let normalized: string;
    try {
      normalized = new URL(origin).origin;
    } catch {
      return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
    }
    if (!configuredOrigins(request).has(normalized)) {
      return NextResponse.json({ error: "Request origin denied" }, { status: 403 });
    }
  }

  return null;
}
