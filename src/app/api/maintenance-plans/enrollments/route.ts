import { NextRequest, NextResponse } from "next/server";
import type { BillingFrequency, UserRole } from "@prisma/client";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getEnrollment, listEnrollments } from "@/lib/maintenance-plans/queries";
import { canManageEnrollments, canViewMaintenancePlans } from "@/lib/maintenance-plans/permissions";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canViewMaintenancePlans(user.role as UserRole)) return forbiddenResponse();

    const { searchParams } = request.nextUrl;
    const enrollments = await listEnrollments(user.companyId, {
      customerId: searchParams.get("customerId") ?? undefined,
      propertyId: searchParams.get("propertyId") ?? undefined,
      status: searchParams.get("status") ?? undefined,
    });

    return NextResponse.json({ enrollments, total: enrollments.length });
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canManageEnrollments(user.role as UserRole)) return forbiddenResponse();

    const body = await request.json();
    if (!body.customerId) return badRequestResponse("customerId is required");
    if (!body.propertyId) return badRequestResponse("propertyId is required");
    if (!body.templateId) return badRequestResponse("templateId is required");

    const [customer, property, template] = await Promise.all([
      prisma.customer.findFirst({ where: { id: body.customerId, companyId: user.companyId } }),
      prisma.customerProperty.findFirst({
        where: { id: body.propertyId, companyId: user.companyId, customerId: body.customerId },
      }),
      prisma.maintenancePlanTemplate.findFirst({
        where: { id: body.templateId, companyId: user.companyId },
      }),
    ]);

    if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    if (!property) return NextResponse.json({ error: "Property not found" }, { status: 404 });
    if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

    const billingFrequency = (body.billingFrequency as BillingFrequency) ?? "ANNUAL";
    if (!template.allowedBillingFrequencies.includes(billingFrequency)) {
      return badRequestResponse("billingFrequency is not allowed for this template");
    }

    const selectedAddonIds = Array.isArray(body.selectedAddonIds) ? body.selectedAddonIds : [];
    if (selectedAddonIds.length > 0) {
      const addonCount = await prisma.maintenancePlanAddon.count({
        where: { templateId: template.id, id: { in: selectedAddonIds }, active: true },
      });
      if (addonCount !== selectedAddonIds.length) {
        return badRequestResponse("One or more selected addons are invalid");
      }
    }

    const enrollment = await prisma.maintenancePlanEnrollment.create({
      data: {
        companyId: user.companyId,
        customerId: body.customerId,
        propertyId: body.propertyId,
        templateId: body.templateId,
        status: "DRAFT",
        billingFrequency,
        startDate: body.startDate ? new Date(body.startDate) : new Date(),
        autoRenew: body.autoRenew !== undefined ? Boolean(body.autoRenew) : template.autoRenewDefault,
        selectedAddonIds,
      },
    });

    const full = await getEnrollment(user.companyId, enrollment.id);
    return NextResponse.json(full, { status: 201 });
  } catch {
    return unauthorizedResponse();
  }
}
