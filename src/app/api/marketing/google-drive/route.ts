import { NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canManageCustomers } from "@/lib/customers/permissions";
import {
  buildGoogleDriveAuthUrl,
  isGoogleDriveConfigured,
} from "@/lib/google-drive/client";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canManageCustomers(user.role)) return forbiddenResponse();

    if (!isGoogleDriveConfigured()) {
      return NextResponse.json(
        {
          error:
            "Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET on the server (Vercel environment variables).",
        },
        { status: 503 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
    const redirectUri = `${appUrl}/api/marketing/google-drive/callback`;
    const url = buildGoogleDriveAuthUrl(user.companyId, redirectUri);

    return NextResponse.redirect(url);
  } catch {
    return unauthorizedResponse();
  }
}

export async function DELETE() {
  try {
    const user = await requireSessionUser();
    if (!canManageCustomers(user.role)) return forbiddenResponse();

    await prisma.company.update({
      where: { id: user.companyId },
      data: {
        googleDriveRefreshToken: null,
        googleDriveConnectedAt: null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return unauthorizedResponse();
  }
}
