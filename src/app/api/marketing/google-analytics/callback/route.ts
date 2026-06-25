import { NextRequest, NextResponse } from "next/server";
import {
  exchangeOAuthCode,
  listGa4Properties,
  pickDefaultGa4Property,
  saveGoogleAnalyticsProperty,
  verifyOAuthState,
} from "@/lib/google-analytics/client";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  const redirectBase = `${appUrl}/marketing/seo`;

  try {
    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");
    const oauthError = request.nextUrl.searchParams.get("error");

    if (oauthError) {
      return NextResponse.redirect(`${redirectBase}?ga_error=${encodeURIComponent(oauthError)}`);
    }

    if (!code || !state) {
      return NextResponse.redirect(`${redirectBase}?ga_error=missing_oauth_params`);
    }

    const companyId = verifyOAuthState(state);
    if (!companyId) {
      return NextResponse.redirect(`${redirectBase}?ga_error=invalid_oauth_state`);
    }

    const redirectUri = `${appUrl}/api/marketing/google-analytics/callback`;
    const tokens = await exchangeOAuthCode(code, redirectUri);

    const existing = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        googleAnalyticsRefreshToken: true,
        googleAnalyticsPropertyId: true,
        organicSearchWebsiteUrl: true,
        website: true,
      },
    });
    if (!existing) {
      return NextResponse.redirect(`${redirectBase}?ga_error=company_not_found`);
    }

    await prisma.company.update({
      where: { id: companyId },
      data: {
        googleAnalyticsRefreshToken:
          tokens.refresh_token ?? existing.googleAnalyticsRefreshToken,
        googleAnalyticsConnectedAt: new Date(),
      },
    });

    if (!existing.googleAnalyticsPropertyId) {
      try {
        const properties = await listGa4Properties(companyId);
        const defaultProperty = pickDefaultGa4Property(
          properties,
          existing.organicSearchWebsiteUrl ?? existing.website
        );
        if (defaultProperty) {
          await saveGoogleAnalyticsProperty(companyId, defaultProperty);
        }
      } catch {
        /* property can be selected manually */
      }
    }

    return NextResponse.redirect(`${redirectBase}?ga_connected=1`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "oauth_failed";
    return NextResponse.redirect(`${redirectBase}?ga_error=${encodeURIComponent(message)}`);
  }
}
