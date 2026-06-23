import { NextRequest, NextResponse } from "next/server";
import { VisitChecklistStatus } from "@prisma/client";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { checklistIsComplete } from "@/lib/checklists/validation";
import { serializeVisitChecklist } from "@/lib/checklists/serialize";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string; checklistId: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id, checklistId } = await params;

    const checklist = await prisma.visitChecklist.findFirst({
      where: {
        id: checklistId,
        visitId: id,
        visit: { companyId: user.companyId },
      },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    if (!checklist) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (!checklistIsComplete(checklist)) {
      return badRequestResponse("Complete all required items before marking this checklist done");
    }

    const updated = await prisma.visitChecklist.update({
      where: { id: checklistId },
      data: {
        status: VisitChecklistStatus.COMPLETED,
        completedAt: new Date(),
      },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });

    return NextResponse.json(serializeVisitChecklist(updated));
  } catch {
    return unauthorizedResponse();
  }
}
