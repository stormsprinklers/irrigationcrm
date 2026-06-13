import { NextRequest, NextResponse } from "next/server";
import type { PlanVisitSeason, UserRole } from "@prisma/client";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getTemplate } from "@/lib/maintenance-plans/queries";
import { canManageTemplates, canViewMaintenancePlans } from "@/lib/maintenance-plans/permissions";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

async function assertTemplate(companyId: string, templateId: string) {
  return prisma.maintenancePlanTemplate.findFirst({ where: { id: templateId, companyId } });
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canViewMaintenancePlans(user.role as UserRole)) return forbiddenResponse();

    const { id } = await params;
    const items = await prisma.maintenancePlanVisitTemplate.findMany({
      where: { templateId: id, template: { companyId: user.companyId } },
      orderBy: { sortOrder: "asc" },
    });
    return NextResponse.json(items);
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canManageTemplates(user.role as UserRole)) return forbiddenResponse();

    const { id } = await params;
    if (!(await assertTemplate(user.companyId, id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json();
    if (!body.name) return badRequestResponse("name is required");
    if (!body.visitTitle) return badRequestResponse("visitTitle is required");
    if (body.defaultMonth === undefined) return badRequestResponse("defaultMonth is required");

    await prisma.maintenancePlanVisitTemplate.create({
      data: {
        templateId: id,
        name: String(body.name),
        season: (body.season as PlanVisitSeason) ?? "CUSTOM",
        defaultMonth: Number(body.defaultMonth),
        visitTitle: String(body.visitTitle),
        description: body.description ?? null,
        estimatedMinutes: body.estimatedMinutes ?? 60,
        sortOrder: body.sortOrder ?? 0,
      },
    });

    const template = await getTemplate(user.companyId, id);
    return NextResponse.json(template, { status: 201 });
  } catch {
    return unauthorizedResponse();
  }
}
