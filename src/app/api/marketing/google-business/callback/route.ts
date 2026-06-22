import { NextRequest, NextResponse } from "next/server";
import {
  exchangeOAuthCode,
  listGbpAccounts,
  verifyOAuthState,
} from "@/lib/google-business/client";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  const redirectBase = `${appUrl}/marketing/google-business`;

  try {
    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");
    const oauthError = request.nextUrl.searchParams.get("error");

    if (oauthError) {
      return NextResponse.redirect(
        `${redirectBase}?error=${encodeURIComponent(oauthError)}`
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(`${redirectBase}?error=missing_oauth_params`);
    }

    const companyId = verifyOAuthState(state);
    if (!companyId) {
      return NextResponse.redirect(`${redirectBase}?error=invalid_oauth_state`);
    }

    const redirectUri = `${appUrl}/api/marketing/google-business/callback`;
    const tokens = await exchangeOAuthCode(companyId, code, redirectUri);

    const existing = await prisma.company.findUnique({
      where: { id: companyId },
      select: { googleBusinessRefreshToken: true },
    });
    if (!existing) {
      return NextResponse.redirect(`${redirectBase}?error=company_not_found`);
    }

    await prisma.company.update({
      where: { id: companyId },
      data: {
        googleBusinessRefreshToken: tokens.refresh_token ?? existing.googleBusinessRefreshToken,
        googleBusinessConnectedAt: new Date(),
      },
    });

    if (tokens.access_token) {
      const accounts = await listGbpAccounts(tokens.access_token);
      if (accounts.length === 1) {
        await prisma.company.update({
          where: { id: companyId },
          data: { googleBusinessAccountId: accounts[0].name },
        });
      }
    }

    return NextResponse.redirect(`${redirectBase}?connected=1`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "oauth_failed";
    return NextResponse.redirect(`${redirectBase}?error=${encodeURIComponent(message)}`);
  }
}
