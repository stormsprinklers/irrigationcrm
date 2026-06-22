import { NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canManageCustomers } from "@/lib/customers/permissions";
import {
  buildGoogleBusinessAuthUrl,
  getGbpConnectionStatus,
  isGoogleBusinessConfigured,
} from "@/lib/google-business/client";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canManageCustomers(user.role)) return forbiddenResponse();

    if (!isGoogleBusinessConfigured()) {
      return NextResponse.json(
        {
          error:
            "Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET on the server (Vercel environment variables).",
        },
        { status: 503 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
    const redirectUri = `${appUrl}/api/marketing/google-business/callback`;
    const url = buildGoogleBusinessAuthUrl(user.companyId, redirectUri);

    return NextResponse.redirect(url);
  } catch {
    return unauthorizedResponse();
  }
}

export async function DELETE() {
  try {
    const user = await requireSessionUser();
    if (!canManageCustomers(user.role)) return forbiddenResponse();

    const { prisma } = await import("@/lib/prisma");
    await prisma.company.update({
      where: { id: user.companyId },
      data: {
        googleBusinessRefreshToken: null,
        googleBusinessAccountId: null,
        googleBusinessLocationId: null,
        googleBusinessLocationTitle: null,
        googleBusinessConnectedAt: null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return unauthorizedResponse();
  }
}
