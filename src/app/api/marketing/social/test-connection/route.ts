import { NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canManageCustomers } from "@/lib/customers/permissions";
import { diagnoseMetaAccessToken, resolvePageAccessToken } from "@/lib/meta/token";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canManageCustomers(user.role)) return forbiddenResponse();

    const body = await request.json().catch(() => ({}));
    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: {
        metaAppId: true,
        metaAppSecret: true,
        metaPageId: true,
        metaPageAccessToken: true,
      },
    });

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const pageId =
      (typeof body.metaPageId === "string" ? body.metaPageId.trim() : "") ||
      company.metaPageId?.trim() ||
      "";

    const token =
      (typeof body.metaPageAccessToken === "string" ? body.metaPageAccessToken.trim() : "") ||
      company.metaPageAccessToken?.trim() ||
      "";

    if (!pageId) {
      return NextResponse.json({ error: "Facebook Page ID is required." }, { status: 400 });
    }
    if (!token) {
      return NextResponse.json({ error: "Meta access token is required." }, { status: 400 });
    }

    const appId = company.metaAppId ?? process.env.META_APP_ID?.trim() ?? null;
    const appSecret = company.metaAppSecret ?? null;

    const diagnostics = await diagnoseMetaAccessToken({
      token,
      pageId,
      appId,
      appSecret,
    });

    if (diagnostics.error) {
      return NextResponse.json({ ok: false, diagnostics }, { status: 400 });
    }

    const resolved = await resolvePageAccessToken({
      token,
      pageId,
      appId,
      appSecret,
    });

    await prisma.company.update({
      where: { id: user.companyId },
      data: {
        metaPageAccessToken: resolved.pageToken,
        ...(resolved.instagramAccountId ? { metaInstagramAccountId: resolved.instagramAccountId } : {}),
      },
    });

    return NextResponse.json({
      ok: true,
      diagnostics,
      resolved: {
        pageName: resolved.pageName,
        source: resolved.source,
        instagramAccountId: resolved.instagramAccountId,
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    return unauthorizedResponse();
  }
}
