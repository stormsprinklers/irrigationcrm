import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { syncVisitChecklists, loadVisitChecklistsForValidation } from "@/lib/checklists/apply";
import { serializeVisitChecklist } from "@/lib/checklists/serialize";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;

    const visit = await prisma.visit.findFirst({
      where: { id, companyId: user.companyId },
      select: { id: true },
    });
    if (!visit) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await syncVisitChecklists(id, user.companyId);

    const [checklists, company] = await Promise.all([
      loadVisitChecklistsForValidation(id),
      prisma.company.findUnique({
        where: { id: user.companyId },
        select: { mergeVisitChecklists: true },
      }),
    ]);

    return NextResponse.json({
      mergeVisitChecklists: company?.mergeVisitChecklists ?? false,
      checklists: checklists.map(serializeVisitChecklist),
    });
  } catch {
    return unauthorizedResponse();
  }
}
