import { NextRequest, NextResponse } from "next/server";
import {
  exchangeGoogleCalendarOAuthCode,
  fetchPrimaryCalendarEmail,
  getGoogleCalendarAccessToken,
  verifyOAuthState,
} from "@/lib/google-calendar/client";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  const redirectBase = `${appUrl}/settings/booking`;

  try {
    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");
    const oauthError = request.nextUrl.searchParams.get("error");

    if (oauthError) {
      return NextResponse.redirect(`${redirectBase}?error=${encodeURIComponent(oauthError)}`);
    }

    if (!code || !state) {
      return NextResponse.redirect(`${redirectBase}?error=missing_oauth_params`);
    }

    const companyId = verifyOAuthState(state);
    if (!companyId) {
      return NextResponse.redirect(`${redirectBase}?error=invalid_oauth_state`);
    }

    const redirectUri = `${appUrl}/api/settings/booking/google-calendar/callback`;
    const tokens = await exchangeGoogleCalendarOAuthCode(code, redirectUri);

    const existing = await prisma.company.findUnique({
      where: { id: companyId },
      select: { googleCalendarRefreshToken: true },
    });
    if (!existing) {
      return NextResponse.redirect(`${redirectBase}?error=company_not_found`);
    }

    const refreshToken = tokens.refresh_token ?? existing.googleCalendarRefreshToken;
    if (!refreshToken) {
      return NextResponse.redirect(`${redirectBase}?error=missing_refresh_token`);
    }
    await prisma.company.update({
      where: { id: companyId },
      data: {
        googleCalendarRefreshToken: refreshToken,
        googleCalendarConnectedAt: new Date(),
      },
    });

    try {
      const accessToken = await getGoogleCalendarAccessToken(companyId);
      const email = await fetchPrimaryCalendarEmail(accessToken);
      if (email) {
        await prisma.company.update({
          where: { id: companyId },
          data: { googleCalendarConnectedEmail: email },
        });
      }
    } catch (err) {
      console.error("[google-calendar] failed to read calendar email", err);
    }

    return NextResponse.redirect(`${redirectBase}?calendar=connected`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "oauth_failed";
    return NextResponse.redirect(`${redirectBase}?error=${encodeURIComponent(message)}`);
  }
}
