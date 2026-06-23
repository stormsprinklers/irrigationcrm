import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { getAuthSecret } from "@/lib/auth-secret";

const publicPaths = [
  "/login",
  "/pay",
  "/book",
  "/portal",
  "/api/auth",
  "/api/book/public",
  "/api/portal/auth",
  "/api/portal/company",
  "/api/twilio",
  "/api/sendgrid",
  "/api/stripe/webhook",
  "/api/invoices/public",
  "/api/marketing/google-business/callback",
];

const authSecret = getAuthSecret();

const ROBOTS_TAG = "noindex, nofollow, noarchive, nosnippet, noimageindex";

function withNoIndex(response: NextResponse) {
  response.headers.set("X-Robots-Tag", ROBOTS_TAG);
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

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
    if (pathname.startsWith("/api/portal/")) {
      return withNoIndex(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
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
