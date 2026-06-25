import { NextRequest, NextResponse } from "next/server";
import { GA4_DEPRECATED_MESSAGE } from "@/lib/google-analytics/deprecated";

/** @deprecated GA4 OAuth callback — redirects to SEO with deprecation notice. */
export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? request.nextUrl.origin;
  const url = new URL("/marketing/seo", appUrl);
  url.searchParams.set("error", GA4_DEPRECATED_MESSAGE);
  return NextResponse.redirect(url);
}
