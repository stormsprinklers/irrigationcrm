import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { canManageCustomers } from "@/lib/customers/permissions";
import { MetaAdsApiError, saveMetaAdAccount, saveMetaAdsAccessToken } from "@/lib/meta/ads";
import { maskSecret } from "@/lib/meta/webhook";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireSessionUser();
    if (!canManageCustomers(user.role)) return forbiddenResponse();

    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: {
        metaAdsAccessToken: true,
        metaPageAccessToken: true,
        metaAdAccountId: true,
        metaAdAccountName: true,
      },
    });

    return NextResponse.json({
      hasDedicatedToken: Boolean(company?.metaAdsAccessToken),
      dedicatedTokenPreview: maskSecret(company?.metaAdsAccessToken),
      hasFallbackToken: Boolean(company?.metaPageAccessToken),
      fallbackTokenPreview: maskSecret(company?.metaPageAccessToken),
      adAccountId: company?.metaAdAccountId,
      adAccountName: company?.metaAdAccountName,
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

    if (body.metaAdsAccessToken !== undefined) {
      const token = typeof body.metaAdsAccessToken === "string" ? body.metaAdsAccessToken.trim() : "";
      await saveMetaAdsAccessToken(user.companyId, token);
    }

    if (body.adAccountId && body.adAccountName) {
      await saveMetaAdAccount(
        user.companyId,
        String(body.adAccountId),
        String(body.adAccountName)
      );
    }

    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: {
        metaAdsAccessToken: true,
        metaAdAccountId: true,
        metaAdAccountName: true,
        metaAdsConnectedAt: true,
      },
    });

    return NextResponse.json({
      hasDedicatedToken: Boolean(company?.metaAdsAccessToken),
      dedicatedTokenPreview: maskSecret(company?.metaAdsAccessToken),
      adAccountId: company?.metaAdAccountId,
      adAccountName: company?.metaAdAccountName,
      connectedAt: company?.metaAdsConnectedAt?.toISOString() ?? null,
    });
  } catch (error) {
    if (error instanceof MetaAdsApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message = error instanceof Error ? error.message : "Failed to save Meta Ads settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canManageCustomers(user.role)) return forbiddenResponse();

    const body = await request.json();
    const adAccountId = String(body.adAccountId ?? "").trim();
    const adAccountName = String(body.adAccountName ?? "").trim();
    if (!adAccountId) return badRequestResponse("adAccountId is required");
    if (!adAccountName) return badRequestResponse("adAccountName is required");

    await saveMetaAdAccount(user.companyId, adAccountId, adAccountName);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof MetaAdsApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message = error instanceof Error ? error.message : "Failed to save Meta ad account";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const user = await requireSessionUser();
    if (!canManageCustomers(user.role)) return forbiddenResponse();

    await prisma.company.update({
      where: { id: user.companyId },
      data: {
        metaAdsAccessToken: null,
        metaAdAccountId: null,
        metaAdAccountName: null,
        metaAdsConnectedAt: null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return unauthorizedResponse();
  }
}
