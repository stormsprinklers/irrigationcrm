import { NextRequest, NextResponse } from "next/server";
import type { BillingFrequency, CancellationFeeType, PlanDurationType, UserRole } from "@prisma/client";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getTemplate } from "@/lib/maintenance-plans/queries";
import { canManageTemplates, canViewMaintenancePlans } from "@/lib/maintenance-plans/permissions";
import { syncTemplateToStripe } from "@/lib/maintenance-plans/stripe-sync";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canViewMaintenancePlans(user.role as UserRole)) return forbiddenResponse();

    const { id } = await params;
    const template = await getTemplate(user.companyId, id);
    if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(template);
  } catch {
    return unauthorizedResponse();
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canManageTemplates(user.role as UserRole)) return forbiddenResponse();

    const { id } = await params;
    const existing = await prisma.maintenancePlanTemplate.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();
    await prisma.maintenancePlanTemplate.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: String(body.name) } : {}),
        ...(body.description !== undefined ? { description: body.description ?? null } : {}),
        ...(body.termsText !== undefined ? { termsText: body.termsText ?? null } : {}),
        ...(body.termsHtml !== undefined ? { termsHtml: body.termsHtml ?? null } : {}),
        ...(body.basePrice !== undefined ? { basePrice: Number(body.basePrice) } : {}),
        ...(body.active !== undefined ? { active: Boolean(body.active) } : {}),
        ...(body.durationType !== undefined ? { durationType: body.durationType as PlanDurationType } : {}),
        ...(body.durationYears !== undefined ? { durationYears: body.durationYears ?? null } : {}),
        ...(body.allowedBillingFrequencies !== undefined
          ? { allowedBillingFrequencies: body.allowedBillingFrequencies as BillingFrequency[] }
          : {}),
        ...(body.autoRenewDefault !== undefined ? { autoRenewDefault: Boolean(body.autoRenewDefault) } : {}),
        ...(body.cancellationFeeType !== undefined
          ? { cancellationFeeType: body.cancellationFeeType as CancellationFeeType }
          : {}),
        ...(body.cancellationFeeAmount !== undefined ? { cancellationFeeAmount: body.cancellationFeeAmount ?? null } : {}),
        ...(body.cancellationNoticeDays !== undefined
          ? { cancellationNoticeDays: Number(body.cancellationNoticeDays) }
          : {}),
        ...(body.benefits !== undefined ? { benefits: Array.isArray(body.benefits) ? body.benefits : [] } : {}),
      },
    });

    const updated = await prisma.maintenancePlanTemplate.findUnique({ where: { id } });
    if (updated?.active && process.env.STRIPE_SECRET_KEY) {
      await syncTemplateToStripe(id);
    }

    const template = await getTemplate(user.companyId, id);
    return NextResponse.json(template);
  } catch {
    return unauthorizedResponse();
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canManageTemplates(user.role as UserRole)) return forbiddenResponse();

    const { id } = await params;
    const existing = await prisma.maintenancePlanTemplate.findFirst({
      where: { id, companyId: user.companyId },
      include: { _count: { select: { enrollments: true } } },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing._count.enrollments > 0) {
      return NextResponse.json({ error: "Cannot delete template with enrollments" }, { status: 400 });
    }

    await prisma.maintenancePlanTemplate.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return unauthorizedResponse();
  }
}
