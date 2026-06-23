import { NextRequest, NextResponse } from "next/server";
import { verifyPortalLoginToken } from "@/lib/portal/login";
import { encodePortalSession, portalSessionCookieOptions } from "@/lib/portal/session";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const slug = request.nextUrl.searchParams.get("slug");

  if (!token || !slug) {
    return NextResponse.redirect(new URL(`/portal/${slug ?? ""}/login?error=invalid`, request.url));
  }

  const verified = await verifyPortalLoginToken(token, slug);
  if (!verified) {
    return NextResponse.redirect(new URL(`/portal/${slug}/login?error=expired`, request.url));
  }

  const sessionToken = encodePortalSession({
    customerId: verified.customerId,
    companyId: verified.companyId,
  });

  const response = NextResponse.redirect(new URL(`/portal/${slug}`, request.url));
  response.cookies.set(
    "portal_session",
    sessionToken,
    portalSessionCookieOptions(request.nextUrl.protocol === "https:")
  );
  return response;
}
