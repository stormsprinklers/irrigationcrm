import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { recalculateCalculatedServicesUsingLaborRate } from "@/lib/price-book/pricing";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    if (body.isDefault) {
      await prisma.laborRate.updateMany({
        where: { companyId: user.companyId },
        data: { isDefault: false },
      });
    }

    const rate = await prisma.laborRate.update({
      where: { id, companyId: user.companyId },
      data: {
        ...(body.name !== undefined ? { name: String(body.name) } : {}),
        ...(body.hourlyCost !== undefined ? { hourlyCost: Number(body.hourlyCost) } : {}),
        ...(body.hourlyPrice !== undefined ? { hourlyPrice: Number(body.hourlyPrice) } : {}),
        ...(body.isDefault !== undefined ? { isDefault: Boolean(body.isDefault) } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: Number(body.sortOrder) } : {}),
      },
    });

    await recalculateCalculatedServicesUsingLaborRate(rate.id);

    return NextResponse.json(rate);
  } catch {
    return unauthorizedResponse();
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    await prisma.laborRate.delete({ where: { id, companyId: user.companyId } });
    return NextResponse.json({ ok: true });
  } catch {
    return unauthorizedResponse();
  }
}
