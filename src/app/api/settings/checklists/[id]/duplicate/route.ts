import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canManageChecklists } from "@/lib/checklists/permissions";
import { checklistTemplateInclude, serializeChecklistTemplate } from "@/lib/checklists/queries";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canManageChecklists(user.role as UserRole)) return forbiddenResponse();

    const { id } = await params;
    const source = await prisma.checklistTemplate.findFirst({
      where: { id, companyId: user.companyId },
      include: {
        items: { orderBy: { sortOrder: "asc" } },
        lineItemLinks: true,
      },
    });
    if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const duplicate = await prisma.checklistTemplate.create({
      data: {
        companyId: user.companyId,
        name: `${source.name} (copy)`,
        description: source.description,
        active: false,
        applyToAllJobs: source.applyToAllJobs,
        divisions: source.divisions,
        excludeCallbacks: source.excludeCallbacks,
        requiredForCompletion: source.requiredForCompletion,
        customerVisible: source.customerVisible,
        sortOrder: source.sortOrder + 1,
        items: {
          create: source.items.map((item) => ({
            label: item.label,
            helpText: item.helpText,
            type: item.type,
            required: item.required,
            sortOrder: item.sortOrder,
            options: item.options ?? undefined,
            config: item.config ?? undefined,
          })),
        },
        lineItemLinks: {
          create: source.lineItemLinks.map((link) => ({
            priceBookItemId: link.priceBookItemId,
          })),
        },
      },
      include: checklistTemplateInclude,
    });

    return NextResponse.json(serializeChecklistTemplate(duplicate), { status: 201 });
  } catch {
    return unauthorizedResponse();
  }
}
