import { NextRequest, NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";
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
    const items = await prisma.maintenancePlanAddon.findMany({
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
    if (body.price === undefined) return badRequestResponse("price is required");

    await prisma.maintenancePlanAddon.create({
      data: {
        templateId: id,
        name: String(body.name),
        description: body.description ?? null,
        price: Number(body.price),
        active: body.active !== undefined ? Boolean(body.active) : true,
        sortOrder: body.sortOrder ?? 0,
      },
    });

    const template = await getTemplate(user.companyId, id);
    return NextResponse.json(template, { status: 201 });
  } catch {
    return unauthorizedResponse();
  }
}
