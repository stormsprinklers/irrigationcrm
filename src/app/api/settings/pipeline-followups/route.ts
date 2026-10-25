import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canManageCustomers } from "@/lib/customers/permissions";
import { normalizePipelineFollowUpSettings } from "@/lib/customers/pipeline-followup-settings";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser(request);
    if (!canManageCustomers(user.role)) return forbiddenResponse();
    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: { pipelineFollowUpsEnabled: true, pipelineFollowUpsEnabledAt: true, pipelineFollowUpSettings: true },
    });
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });
    return NextResponse.json({
      enabled: company.pipelineFollowUpsEnabled,
      enabledAt: company.pipelineFollowUpsEnabledAt,
      settings: normalizePipelineFollowUpSettings(company.pipelineFollowUpSettings),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return unauthorizedResponse();
    return NextResponse.json({ error: "Could not load pipeline settings" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireSessionUser(request);
    if (!canManageCustomers(user.role)) return forbiddenResponse();
    const body = await request.json();
    const enabled = body.enabled === true;
    const settings = normalizePipelineFollowUpSettings(body.settings);
    const current = await prisma.company.findUnique({ where: { id: user.companyId }, select: { pipelineFollowUpsEnabled: true, pipelineFollowUpsEnabledAt: true } });
    if (!current) return NextResponse.json({ error: "Company not found" }, { status: 404 });
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      if (!current.pipelineFollowUpsEnabled && enabled && !current.pipelineFollowUpsEnabledAt) {
        // Anything already in the CRM is intentionally paused when automation is first enabled.
        await tx.customer.updateMany({
          where: { companyId: user.companyId, createdAt: { lt: now }, pipelineFollowUpsPausedAt: null },
          data: { pipelineFollowUpsPausedAt: now, pipelineFollowUpsPausedById: user.id },
        });
      }
      await tx.company.update({
        where: { id: user.companyId },
        data: {
          pipelineFollowUpsEnabled: enabled,
          pipelineFollowUpsEnabledAt: enabled && !current.pipelineFollowUpsEnabledAt ? now : undefined,
          pipelineFollowUpSettings: settings as unknown as Prisma.InputJsonValue,
        },
      });
    });
    return NextResponse.json({ ok: true, enabled, settings });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return unauthorizedResponse();
    console.error("Pipeline follow-up settings update failed", error);
    return NextResponse.json({ error: "Could not save pipeline settings" }, { status: 500 });
  }
}
