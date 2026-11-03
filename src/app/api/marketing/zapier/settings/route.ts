import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { canManageCustomers } from "@/lib/customers/permissions";
import { prisma } from "@/lib/prisma";
import { normalizeZapierWebhookUrl } from "@/lib/zapier/pipeline-webhook";

function maskedWebhook(value: string | null | undefined) {
  if (!value) return null;
  try {
    return `${new URL(value).origin}/hooks/catch/••••/••••/`;
  } catch {
    return "Configured";
  }
}

export async function GET() {
  try {
    const user = await requireSessionUser();
    if (!canManageCustomers(user.role)) return forbiddenResponse();
    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: { zapierPipelineWebhookUrl: true },
    });
    return NextResponse.json({
      configured: Boolean(company?.zapierPipelineWebhookUrl),
      webhookPreview: maskedWebhook(company?.zapierPipelineWebhookUrl),
    });
  } catch {
    return unauthorizedResponse();
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canManageCustomers(user.role)) return forbiddenResponse();
    const body = await request.json().catch(() => ({}));
    const raw = typeof body.webhookUrl === "string" ? body.webhookUrl.trim() : "";
    if (!raw) return badRequestResponse("Zapier Catch Hook URL is required");

    let webhookUrl: string;
    try {
      webhookUrl = normalizeZapierWebhookUrl(raw);
    } catch (error) {
      return badRequestResponse(
        error instanceof Error ? error.message : "Enter a valid Zapier Catch Hook URL"
      );
    }

    await prisma.company.update({
      where: { id: user.companyId },
      data: { zapierPipelineWebhookUrl: webhookUrl },
    });
    return NextResponse.json({
      configured: true,
      webhookPreview: maskedWebhook(webhookUrl),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    return NextResponse.json({ error: "Could not save Zapier settings" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const user = await requireSessionUser();
    if (!canManageCustomers(user.role)) return forbiddenResponse();
    await prisma.$transaction([
      prisma.company.update({
        where: { id: user.companyId },
        data: { zapierPipelineWebhookUrl: null },
      }),
      prisma.pipelineConversionDelivery.deleteMany({
        where: {
          platform: "ZAPIER",
          status: { not: "SENT" },
          event: { companyId: user.companyId },
        },
      }),
    ]);
    return NextResponse.json({ configured: false, webhookPreview: null });
  } catch {
    return unauthorizedResponse();
  }
}
