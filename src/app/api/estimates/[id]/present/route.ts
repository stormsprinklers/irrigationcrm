import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prepareEstimatePresentation } from "@/lib/estimates/present";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const estimate = await prisma.estimate.findFirst({
      where: { id, companyId: user.companyId },
      select: { id: true },
    });
    if (!estimate) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const force = request.nextUrl.searchParams.get("force") === "1";
    const full = await prepareEstimatePresentation({
      companyId: user.companyId,
      estimateId: id,
      force,
    });
    return NextResponse.json(full);
  } catch {
    return unauthorizedResponse();
  }
}
