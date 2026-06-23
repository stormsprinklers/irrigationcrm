import { NextRequest, NextResponse } from "next/server";
import { VisitChecklistStatus } from "@prisma/client";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { recomputeVisitChecklistStatus } from "@/lib/checklists/apply";
import {
  checklistIsComplete,
  isValidItemResponse,
  validateResponseForType,
} from "@/lib/checklists/validation";
import { serializeVisitChecklist, serializeVisitChecklistItem } from "@/lib/checklists/serialize";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string; checklistId: string; itemId: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id, checklistId, itemId } = await params;

    const item = await prisma.visitChecklistItem.findFirst({
      where: {
        id: itemId,
        visitChecklist: {
          id: checklistId,
          visitId: id,
          visit: { companyId: user.companyId },
        },
      },
      include: {
        visitChecklist: true,
      },
    });
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();
    const response = body.response;

    if (response !== null && response !== undefined) {
      const validated = validateResponseForType(item.type, response, item.options, item.config);
      if (!validated.ok) return badRequestResponse(validated.error);

      if (item.required && !isValidItemResponse(item, validated.response)) {
        return badRequestResponse("Response does not meet item requirements");
      }
    } else if (item.required) {
      return badRequestResponse("This item is required");
    }

    const completedAt = response != null && isValidItemResponse(item, response) ? new Date() : null;

    const updated = await prisma.visitChecklistItem.update({
      where: { id: itemId },
      data: {
        response: response ?? null,
        completedAt,
      },
    });

    await recomputeVisitChecklistStatus(checklistId);

    return NextResponse.json(serializeVisitChecklistItem(updated));
  } catch {
    return unauthorizedResponse();
  }
}
