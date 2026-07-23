import { NextRequest, NextResponse } from "next/server";
import { ChecklistItemType, Division } from "@prisma/client";
import { UserRole } from "@prisma/client";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canManageChecklists } from "@/lib/checklists/permissions";
import { checklistTemplateInclude, serializeChecklistTemplate } from "@/lib/checklists/queries";
import type { ChecklistItemInput } from "@/lib/checklists/types";
import { prisma } from "@/lib/prisma";

function parseItems(items: unknown): ChecklistItemInput[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((raw, index) => {
      if (typeof raw !== "object" || !raw) return null;
      const item = raw as ChecklistItemInput;
      const label = String(item.label ?? "").trim();
      if (!label) return null;
      const type = String(item.type ?? "") as ChecklistItemType;
      if (!Object.values(ChecklistItemType).includes(type)) return null;
      return {
        label,
        helpText: item.helpText ? String(item.helpText) : null,
        type,
        required: Boolean(item.required),
        sortOrder: typeof item.sortOrder === "number" ? item.sortOrder : index,
        options: item.options ?? null,
        config: item.config ?? null,
      };
    })
    .filter(Boolean) as ChecklistItemInput[];
}

function parseDivisions(divisions: unknown): Division[] {
  if (!Array.isArray(divisions)) return [];
  return divisions.filter((d): d is Division => d === "INSTALL" || d === "SERVICE");
}

function parsePriceBookItemIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  return ids.map((id) => String(id)).filter(Boolean);
}

export async function GET() {
  try {
    const user = await requireSessionUser();
    if (!canManageChecklists(user.role as UserRole)) return forbiddenResponse();

    const templates = await prisma.checklistTemplate.findMany({
      where: { companyId: user.companyId },
      include: checklistTemplateInclude,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    return NextResponse.json(templates.map(serializeChecklistTemplate));
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canManageChecklists(user.role as UserRole)) return forbiddenResponse();

    const body = await request.json();
    const name = String(body.name ?? "").trim();
    if (!name) return badRequestResponse("Name is required");

    const items = parseItems(body.items);
    const priceBookItemIds = parsePriceBookItemIds(body.priceBookItemIds);
    const applyToAllJobs = Boolean(body.applyToAllJobs);
    const divisions = applyToAllJobs ? [] : parseDivisions(body.divisions);

    if (!applyToAllJobs && !divisions.length && !priceBookItemIds.length) {
      return badRequestResponse("Select at least one division, line item trigger, or apply to all visits");
    }

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

    const template = await prisma.checklistTemplate.create({
      data: {
        companyId: user.companyId,
        name,
        description: body.description ? String(body.description) : null,
        active: body.active !== false,
        applyToAllJobs,
        divisions,
        excludeCallbacks: Boolean(body.excludeCallbacks),
        requiredForCompletion: Boolean(body.requiredForCompletion),
        customerVisible: Boolean(body.customerVisible),
        sortOrder: Number(body.sortOrder) || 0,
        items: {
          create: items.map((item, index) => ({
            label: item.label,
            helpText: item.helpText,
            type: item.type,
            required: item.required ?? false,
            sortOrder: item.sortOrder ?? index,
            options: item.options ?? undefined,
            config: item.config ?? undefined,
          })),
        },
        lineItemLinks: {
          create: priceBookItemIds.map((priceBookItemId) => ({ priceBookItemId })),
        },
      },
      include: checklistTemplateInclude,
    });

    return NextResponse.json(serializeChecklistTemplate(template), { status: 201 });
  } catch {
    return unauthorizedResponse();
  }
}
