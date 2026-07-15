import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { getAuthSecret } from "@/lib/auth-secret";

const publicPaths = [
  "/",
  "/privacy",
  "/login",
  "/forgot-password",
  "/reset-password",
  "/pay",
  "/book",
  "/refer",
  "/portal",
  "/api/auth",
  "/api/book/public",
  "/api/book/hiring",
  "/api/refer",
  "/api/portal/auth",
  "/api/portal/company",
  "/api/portal/feedback",
  "/api/twilio",
  "/api/sendgrid",
  "/api/stripe/webhook",
  "/api/meta",
  "/api/invoices/public",
  "/api/marketing/google-business/callback",
  "/api/marketing/search-console/callback",
  "/api/marketing/google-ads/callback",
  "/api/marketing/google-analytics/callback",
  "/api/integrations",
  "/api/track",
  "/api/mobile/auth/login",
  "/api/mobile/auth/mfa",
  "/api/mobile/auth/refresh",
];

const authSecret = getAuthSecret();

const ROBOTS_TAG = "noindex, nofollow, noarchive, nosnippet, noimageindex";

function withNoIndex(response: NextResponse) {
  response.headers.set("X-Robots-Tag", ROBOTS_TAG);
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Google Search / OAuth HTML file verification (served from /public)
  if (/^\/google[a-z0-9]+\.html$/i.test(pathname)) {
    return NextResponse.next();
  }

  const isPublic = publicPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );

  if (isPublic) {
    return withNoIndex(NextResponse.next());
  }

  const token = await getToken({
    req: request,
    secret: authSecret,
    secureCookie: request.nextUrl.protocol === "https:",
  });

  if (!token) {
    const bearerAuth = request.headers.get("authorization")?.startsWith("Bearer ");
    if (bearerAuth && pathname.startsWith("/api/")) {
      return withNoIndex(NextResponse.next());
    }

    if (pathname.startsWith("/api/portal/")) {
      // Portal APIs authenticate via customer session cookie in route handlers.
      return withNoIndex(NextResponse.next());
    }
    if (pathname.startsWith("/portal/")) {
      const segments = pathname.split("/").filter(Boolean);
      const slug = segments[1];
      if (slug && segments[2] !== "login") {
        const loginUrl = new URL(`/portal/${slug}/login`, request.url);
        loginUrl.searchParams.set("callbackUrl", pathname);
        return withNoIndex(NextResponse.redirect(loginUrl));
      }
      return withNoIndex(NextResponse.next());
    }
    if (pathname.startsWith("/api/")) {
      return withNoIndex(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return withNoIndex(NextResponse.redirect(loginUrl));
  }

  return withNoIndex(NextResponse.next());
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
