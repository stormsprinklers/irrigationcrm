import { NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canManageCustomers } from "@/lib/customers/permissions";
import {
  buildGoogleCalendarAuthUrl,
  getGoogleCalendarConnectionStatus,
  isGoogleCalendarConfigured,
} from "@/lib/google-calendar/client";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canManageCustomers(user.role)) return forbiddenResponse();

    if (!isGoogleCalendarConfigured()) {
      return NextResponse.json(
        {
          error:
            "Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET on the server (Vercel environment variables).",
        },
        { status: 503 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
    const redirectUri = `${appUrl}/api/settings/booking/google-calendar/callback`;
    const url = buildGoogleCalendarAuthUrl(user.companyId, redirectUri);

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
        googleCalendarRefreshToken: null,
        googleCalendarConnectedEmail: null,
        googleCalendarConnectedAt: null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return unauthorizedResponse();
  }
}
