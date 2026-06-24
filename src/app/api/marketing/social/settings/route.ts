import { NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canManageCustomers } from "@/lib/customers/permissions";
import { getAppBaseUrl } from "@/lib/app-url";
import { generateMetaVerifyToken, maskSecret } from "@/lib/meta/webhook";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canManageCustomers(user.role)) return forbiddenResponse();

    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: {
        metaAppId: true,
        metaWebhookVerifyToken: true,
        metaAppSecret: true,
        metaPageId: true,
        metaInstagramAccountId: true,
        metaWebhookVerifiedAt: true,
      },
    });

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const lastEvent = await prisma.metaWebhookEvent.findFirst({
      where: { companyId: user.companyId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, field: true, object: true },
    });

    const callbackUrl = `${getAppBaseUrl(request.nextUrl.origin)}/api/meta/webhook`;

    return NextResponse.json({
      callbackUrl,
      metaAppId: company.metaAppId ?? process.env.META_APP_ID?.trim() ?? null,
      verifyToken: company.metaWebhookVerifyToken,
      verifyTokenPreview: maskSecret(company.metaWebhookVerifyToken),
      hasVerifyToken: Boolean(company.metaWebhookVerifyToken),
      metaPageId: company.metaPageId,
      metaInstagramAccountId: company.metaInstagramAccountId,
      hasAppSecret: Boolean(company.metaAppSecret),
      appSecretPreview: maskSecret(company.metaAppSecret),
      webhookVerifiedAt: company.metaWebhookVerifiedAt?.toISOString() ?? null,
      lastWebhookEvent: lastEvent
        ? {
            at: lastEvent.createdAt.toISOString(),
            object: lastEvent.object,
            field: lastEvent.field,
          }
        : null,
    });
  } catch {
    return unauthorizedResponse();
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canManageCustomers(user.role)) return forbiddenResponse();

    const body = await request.json();
    const data: {
      metaAppId?: string | null;
      metaWebhookVerifyToken?: string;
      metaAppSecret?: string | null;
      metaPageId?: string | null;
      metaInstagramAccountId?: string | null;
      metaWebhookVerifiedAt?: null;
    } = {};

    if (body.metaAppId !== undefined) {
      const appId = typeof body.metaAppId === "string" ? body.metaAppId.trim() : "";
      data.metaAppId = appId || null;
    }

    if (body.regenerateVerifyToken) {
      data.metaWebhookVerifyToken = generateMetaVerifyToken();
      data.metaWebhookVerifiedAt = null;
    } else if (typeof body.verifyToken === "string") {
      const trimmed = body.verifyToken.trim();
      if (trimmed.length < 8) {
        return NextResponse.json(
          { error: "Verify token must be at least 8 characters" },
          { status: 400 }
        );
      }
      data.metaWebhookVerifyToken = trimmed;
      data.metaWebhookVerifiedAt = null;
    }

    if (body.metaAppSecret !== undefined) {
      const secret = typeof body.metaAppSecret === "string" ? body.metaAppSecret.trim() : "";
      data.metaAppSecret = secret || null;
    }

    if (body.metaPageId !== undefined) {
      const pageId = typeof body.metaPageId === "string" ? body.metaPageId.trim() : "";
      data.metaPageId = pageId || null;
    }

    if (body.metaInstagramAccountId !== undefined) {
      const igId =
        typeof body.metaInstagramAccountId === "string" ? body.metaInstagramAccountId.trim() : "";
      data.metaInstagramAccountId = igId || null;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No changes provided" }, { status: 400 });
    }

    const company = await prisma.company.update({
      where: { id: user.companyId },
      data,
      select: {
        metaAppId: true,
        metaWebhookVerifyToken: true,
        metaAppSecret: true,
        metaPageId: true,
        metaInstagramAccountId: true,
        metaWebhookVerifiedAt: true,
      },
    });

    const callbackUrl = `${getAppBaseUrl(request.nextUrl.origin)}/api/meta/webhook`;

    return NextResponse.json({
      callbackUrl,
      metaAppId: company.metaAppId ?? process.env.META_APP_ID?.trim() ?? null,
      verifyToken: company.metaWebhookVerifyToken,
      verifyTokenPreview: maskSecret(company.metaWebhookVerifyToken),
      hasVerifyToken: Boolean(company.metaWebhookVerifyToken),
      metaPageId: company.metaPageId,
      metaInstagramAccountId: company.metaInstagramAccountId,
      hasAppSecret: Boolean(company.metaAppSecret),
      appSecretPreview: maskSecret(company.metaAppSecret),
      webhookVerifiedAt: company.metaWebhookVerifiedAt?.toISOString() ?? null,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return NextResponse.json(
        { error: "That verify token is already in use. Generate a new one." },
        { status: 409 }
      );
    }
    return unauthorizedResponse();
  }
}
