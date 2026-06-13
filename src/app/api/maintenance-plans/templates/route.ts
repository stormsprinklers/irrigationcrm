import { NextRequest, NextResponse } from "next/server";
import type {
  BillingFrequency,
  CancellationFeeType,
  PlanDurationType,
  PlanVisitSeason,
  UserRole,
} from "@prisma/client";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getTemplate, listTemplates } from "@/lib/maintenance-plans/queries";
import { canManageTemplates, canViewMaintenancePlans } from "@/lib/maintenance-plans/permissions";
import { syncTemplateToStripe } from "@/lib/maintenance-plans/stripe-sync";
import { prisma } from "@/lib/prisma";

type VisitTemplateInput = {
  name: string;
  season?: PlanVisitSeason;
  defaultMonth: number;
  visitTitle: string;
  description?: string | null;
  estimatedMinutes?: number;
  sortOrder?: number;
};

export async function GET() {
  try {
    const user = await requireSessionUser();
    if (!canViewMaintenancePlans(user.role as UserRole)) return forbiddenResponse();

    const templates = await listTemplates(user.companyId);
    return NextResponse.json({ templates, total: templates.length });
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canManageTemplates(user.role as UserRole)) return forbiddenResponse();

    const body = await request.json();
    if (!body.name) return badRequestResponse("name is required");
    if (body.basePrice === undefined) return badRequestResponse("basePrice is required");

    const visitTemplates = Array.isArray(body.visitTemplates) ? (body.visitTemplates as VisitTemplateInput[]) : [];

    const template = await prisma.maintenancePlanTemplate.create({
      data: {
        companyId: user.companyId,
        name: String(body.name),
        description: body.description ?? null,
        termsText: body.termsText ?? null,
        termsHtml: body.termsHtml ?? null,
        basePrice: Number(body.basePrice),
        active: body.active !== undefined ? Boolean(body.active) : true,
        durationType: (body.durationType as PlanDurationType) ?? "FIXED_TERM",
        durationYears: body.durationYears ?? null,
        allowedBillingFrequencies: (body.allowedBillingFrequencies as BillingFrequency[]) ?? ["ANNUAL"],
        autoRenewDefault: body.autoRenewDefault !== undefined ? Boolean(body.autoRenewDefault) : true,
        cancellationFeeType: (body.cancellationFeeType as CancellationFeeType) ?? "NONE",
        cancellationFeeAmount: body.cancellationFeeAmount ?? null,
        cancellationNoticeDays: body.cancellationNoticeDays ?? 0,
        benefits: Array.isArray(body.benefits) ? body.benefits : [],
        visitTemplates: visitTemplates.length
          ? {
              create: visitTemplates.map((vt, index) => ({
                name: String(vt.name),
                season: vt.season ?? "CUSTOM",
                defaultMonth: Number(vt.defaultMonth),
                visitTitle: String(vt.visitTitle),
                description: vt.description ?? null,
                estimatedMinutes: vt.estimatedMinutes ?? 60,
                sortOrder: vt.sortOrder ?? index,
              })),
            }
          : undefined,
      },
    });

    if (template.active && process.env.STRIPE_SECRET_KEY) {
      await syncTemplateToStripe(template.id);
    }

    const full = await getTemplate(user.companyId, template.id);
    return NextResponse.json(full, { status: 201 });
  } catch {
    return unauthorizedResponse();
  }
}
