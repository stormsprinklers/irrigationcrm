import { NextRequest, NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getTemplate } from "@/lib/maintenance-plans/queries";
import { canManageTemplates } from "@/lib/maintenance-plans/permissions";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string; addonId: string }> };

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canManageTemplates(user.role as UserRole)) return forbiddenResponse();

    const { id, addonId } = await params;
    const addon = await prisma.maintenancePlanAddon.findFirst({
      where: {
        id: addonId,
        templateId: id,
        template: { companyId: user.companyId },
      },
    });
    if (!addon) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Soft-deactivate so historical enrollments still resolve the name if referenced.
    await prisma.maintenancePlanAddon.update({
      where: { id: addonId },
      data: { active: false },
    });

    // Drop from any enrollments that still have it selected.
    const enrollments = await prisma.maintenancePlanEnrollment.findMany({
      where: {
        companyId: user.companyId,
        templateId: id,
        selectedAddonIds: { has: addonId },
      },
      select: { id: true, selectedAddonIds: true },
    });
    for (const enrollment of enrollments) {
      await prisma.maintenancePlanEnrollment.update({
        where: { id: enrollment.id },
        data: {
          selectedAddonIds: enrollment.selectedAddonIds.filter((x) => x !== addonId),
        },
      });
    }

    const template = await getTemplate(user.companyId, id);
    return NextResponse.json(template);
  } catch {
    return unauthorizedResponse();
  }
}
