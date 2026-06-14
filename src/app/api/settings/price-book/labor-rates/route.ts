import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { listLaborRates } from "@/lib/price-book/queries";
import { recalculateCalculatedServicesUsingLaborRate } from "@/lib/price-book/pricing";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const rates = await listLaborRates(user.companyId);
    return NextResponse.json(rates);
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { name, hourlyCost, hourlyPrice, isDefault, sortOrder } = body;
    if (!name) {
      return NextResponse.json({ error: "Name required" }, { status: 400 });
    }

    if (isDefault) {
      await prisma.laborRate.updateMany({
        where: { companyId: user.companyId },
        data: { isDefault: false },
      });
    }

    const rate = await prisma.laborRate.create({
      data: {
        companyId: user.companyId,
        name: String(name),
        hourlyCost: Number(hourlyCost ?? 0),
        hourlyPrice: Number(hourlyPrice ?? 0),
        isDefault: Boolean(isDefault),
        sortOrder: sortOrder ?? 0,
      },
    });

    if (rate.isDefault) {
      await recalculateCalculatedServicesUsingLaborRate(rate.id);
    }

    return NextResponse.json(rate, { status: 201 });
  } catch {
    return unauthorizedResponse();
  }
}
