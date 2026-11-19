import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { getAuthSecret } from "@/lib/auth-secret";
import { PORTAL_SESSION_COOKIE } from "@/lib/portal/constants";
import { enforceBrowserMutationOrigin } from "@/lib/security/csrf";
import { affiliatePathAllowed } from "@/lib/affiliate/access";
import { bulbPrepPathAllowed } from "@/lib/bulb-prep/access";
import { effectiveSessionRole } from "@/lib/auth/effective-role";
import { prisma } from "@/lib/prisma";

const publicPaths = [
  "/",
  "/privacy",
  "/login",
  "/affiliate/sign-in",
  "/forgot-password",
  "/reset-password",
  "/pay",
  "/book",
  "/refer",
  "/api/auth",
  "/api/book/public",
  "/api/book/hiring",
  "/api/refer",
  "/api/portal/auth",
  "/api/portal/company",
  "/api/portal/feedback",
  "/api/twilio",
  "/api/ai/receptionist",
  "/api/sendgrid",
  "/api/stripe/webhook",
  "/api/stripe/issuing-authorization",
  "/api/meta",
  "/api/invoices/public",
  "/api/marketing/google-business/callback",
  "/api/marketing/search-console/callback",
  "/api/marketing/google-ads/callback",
  "/api/settings/booking/google-calendar/callback",
  "/api/marketing/google-analytics/callback",
  "/api/marketing/unsubscribe",
  "/api/marketing/track",
  "/api/cron",
  "/api/portal/preferences",
  "/api/public",
  "/api/integrations",
  "/api/track",
  "/api/mobile/auth/login",
  "/api/mobile/auth/mfa",
  "/api/mobile/auth/refresh",
  "/sw.js",
  "/manifest.webmanifest",
];

const authSecret = getAuthSecret();

const ROBOTS_TAG = "noindex, nofollow, noarchive, nosnippet, noimageindex";

function withNoIndex(response: NextResponse) {
  response.headers.set("X-Robots-Tag", ROBOTS_TAG);
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const csrfDenied = enforceBrowserMutationOrigin(request);
  if (csrfDenied) return withNoIndex(csrfDenied);

  // Google Search / OAuth HTML file verification (served from /public)
  if (/^\/google[a-z0-9]+\.html$/i.test(pathname)) {
    return NextResponse.next();
  }

  if (pathname === "/portal" || pathname.startsWith("/portal/")) {
    const segments = pathname.split("/").filter(Boolean);
    const slug = segments[1];
    const section = segments[2];
    const isPublicPortalPage =
      !slug ||
      section === "login" ||
      section === "track" ||
      section === "estimates" ||
      section === "feedback";

    if (isPublicPortalPage || request.cookies.has(PORTAL_SESSION_COOKIE)) {
      return withNoIndex(NextResponse.next());
    }

    const loginUrl = new URL(`/portal/${slug}/login`, request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return withNoIndex(NextResponse.redirect(loginUrl));
  }

  const isPublic = publicPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );

  const token = await getToken({
    req: request,
    secret: authSecret,
    secureCookie: request.nextUrl.protocol === "https:",
  });

  if (!token) {
    if (isPublic) {
      return withNoIndex(NextResponse.next());
    }
    const bearerAuth = request.headers.get("authorization")?.startsWith("Bearer ");
    if (bearerAuth && pathname.startsWith("/api/")) {
      return withNoIndex(NextResponse.next());
    }

    if (pathname.startsWith("/api/portal/")) {
      // Portal APIs authenticate via customer session cookie in route handlers.
      return withNoIndex(NextResponse.next());
    }
    if (pathname.startsWith("/api/")) {
      return withNoIndex(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return withNoIndex(NextResponse.redirect(loginUrl));
  }

  const tokenId = typeof token.id === "string" ? token.id : "";
  const tokenCompanyId = typeof token.companyId === "string" ? token.companyId : "";
  const currentAccount = tokenId && tokenCompanyId
    ? await prisma.user.findFirst({
        where: {
          id: tokenId,
          companyId: tokenCompanyId,
          status: "ACTIVE",
          systemKind: null,
        },
        select: { role: true },
      })
    : null;

  if (!currentAccount) {
    if (isPublic) return withNoIndex(NextResponse.next());
    if (pathname.startsWith("/api/")) {
      return withNoIndex(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    }
    return withNoIndex(NextResponse.redirect(new URL("/login", request.url)));
  }

  const role = effectiveSessionRole({
    tokenRole: typeof token.role === "string" ? token.role : currentAccount.role,
    tokenTrueRole: typeof token.trueRole === "string" ? token.trueRole : undefined,
    currentRole: currentAccount.role,
  });

  // Apply this before the general public-path bypass. A signed-in Bulb Prep
  // employee must not reach webhook/integration APIs just because those routes
  // also accept unauthenticated provider traffic.
  if (role === "BULB_PREP") {
    if (pathname.startsWith("/api/") && !bulbPrepPathAllowed(pathname)) {
      return withNoIndex(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    }
    if (!pathname.startsWith("/api/") && !bulbPrepPathAllowed(pathname)) {
      return withNoIndex(NextResponse.redirect(new URL("/home", request.url)));
    }
  }

  if (isPublic) {
    return withNoIndex(NextResponse.next());
  }

  // Affiliates are intentionally isolated from the staff CRM. Enforce the
  // boundary here as well as in route handlers so guessing a URL cannot expose
  // phone records, settings, customer profiles, or other company data.
  if (role === "AFFILIATE") {
    if (pathname.startsWith("/api/") && !affiliatePathAllowed(pathname)) {
      return withNoIndex(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    }
    if (!pathname.startsWith("/api/") && !affiliatePathAllowed(pathname)) {
      return withNoIndex(NextResponse.redirect(new URL("/affiliate", request.url)));
    }
  }

  return withNoIndex(NextResponse.next());
}

export const runtime = "nodejs";

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
