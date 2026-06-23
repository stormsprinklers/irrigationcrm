import { NextRequest, NextResponse } from "next/server";
import { ChecklistItemType, Division, UserRole } from "@prisma/client";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canManageChecklists } from "@/lib/checklists/permissions";
import { checklistTemplateInclude, serializeChecklistTemplate } from "@/lib/checklists/queries";
import type { ChecklistItemInput } from "@/lib/checklists/types";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

function parseItems(items: unknown): ChecklistItemInput[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((raw, index) => {
      if (typeof raw !== "object" || !raw) return null;
      const item = raw as ChecklistItemInput & { id?: string };
      const label = String(item.label ?? "").trim();
      if (!label) return null;
      const type = String(item.type ?? "") as ChecklistItemType;
      if (!Object.values(ChecklistItemType).includes(type)) return null;
      return {
        id: item.id,
        label,
        helpText: item.helpText ? String(item.helpText) : null,
        type,
        required: Boolean(item.required),
        sortOrder: typeof item.sortOrder === "number" ? item.sortOrder : index,
        options: item.options ?? null,
        config: item.config ?? null,
      };
    })
    .filter(Boolean) as (ChecklistItemInput & { id?: string })[];
}

function parseDivisions(divisions: unknown): Division[] {
  if (!Array.isArray(divisions)) return [];
  return divisions.filter((d): d is Division => d === "INSTALL" || d === "SERVICE");
}

function parsePriceBookItemIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  return ids.map((id) => String(id)).filter(Boolean);
}

async function getTemplate(companyId: string, id: string) {
  return prisma.checklistTemplate.findFirst({
    where: { id, companyId },
    include: checklistTemplateInclude,
  });
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canManageChecklists(user.role as UserRole)) return forbiddenResponse();

    const { id } = await params;
    const template = await getTemplate(user.companyId, id);
    if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json(serializeChecklistTemplate(template));
  } catch {
    return unauthorizedResponse();
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canManageChecklists(user.role as UserRole)) return forbiddenResponse();

    const { id } = await params;
    const existing = await prisma.checklistTemplate.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();

    const applyToAllJobs =
      body.applyToAllJobs !== undefined ? Boolean(body.applyToAllJobs) : existing.applyToAllJobs;
    const divisions =
      body.divisions !== undefined
        ? applyToAllJobs
          ? []
          : parseDivisions(body.divisions)
        : existing.divisions;

    if (body.priceBookItemIds !== undefined) {
      const priceBookItemIds = parsePriceBookItemIds(body.priceBookItemIds);
      if (priceBookItemIds.length) {
        const count = await prisma.priceBookItem.count({
          where: {
            id: { in: priceBookItemIds },
            category: { companyId: user.companyId },
          },
        });
        if (count !== priceBookItemIds.length) {
          return badRequestResponse("One or more price book items are invalid");
        }
      }
      await prisma.checklistTemplateLineItem.deleteMany({ where: { templateId: id } });
      if (priceBookItemIds.length) {
        await prisma.checklistTemplateLineItem.createMany({
          data: priceBookItemIds.map((priceBookItemId) => ({ templateId: id, priceBookItemId })),
        });
      }
    }

    if (body.items !== undefined) {
      const items = parseItems(body.items);
      await prisma.checklistItemTemplate.deleteMany({ where: { templateId: id } });
      if (items.length) {
        await prisma.checklistItemTemplate.createMany({
          data: items.map((item, index) => ({
            templateId: id,
            label: item.label,
            helpText: item.helpText,
            type: item.type,
            required: item.required ?? false,
            sortOrder: item.sortOrder ?? index,
            options: item.options ?? undefined,
            config: item.config ?? undefined,
          })),
        });
      }
    }

    const name = body.name !== undefined ? String(body.name).trim() : existing.name;
    if (!name) return badRequestResponse("Name is required");

    if (!applyToAllJobs && body.divisions !== undefined && divisions.length === 0) {
      const linkCount = await prisma.checklistTemplateLineItem.count({ where: { templateId: id } });
      if (linkCount === 0) {
        return badRequestResponse("Select at least one division, line item trigger, or apply to all jobs");
      }
    }

    await prisma.checklistTemplate.update({
      where: { id },
      data: {
        name,
        ...(body.description !== undefined ? { description: body.description ? String(body.description) : null } : {}),
        ...(body.active !== undefined ? { active: Boolean(body.active) } : {}),
        applyToAllJobs,
        divisions,
        ...(body.excludeCallbacks !== undefined ? { excludeCallbacks: Boolean(body.excludeCallbacks) } : {}),
        ...(body.requiredForCompletion !== undefined
          ? { requiredForCompletion: Boolean(body.requiredForCompletion) }
          : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: Number(body.sortOrder) || 0 } : {}),
      },
    });

    const template = await getTemplate(user.companyId, id);
    return NextResponse.json(serializeChecklistTemplate(template!));
  } catch {
    return unauthorizedResponse();
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canManageChecklists(user.role as UserRole)) return forbiddenResponse();

    const { id } = await params;
    const result = await prisma.checklistTemplate.deleteMany({
      where: { id, companyId: user.companyId },
    });
    if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch {
    return unauthorizedResponse();
  }
}
