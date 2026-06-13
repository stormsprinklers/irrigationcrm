import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const scope = request.nextUrl.searchParams.get("scope") ?? "external";

    const customers = await prisma.customer.findMany({
      where: { companyId: user.companyId },
      orderBy: { name: "asc" },
      take: 50,
    });

    if (scope === "internal") {
      const employees = await prisma.user.findMany({
        where: { companyId: user.companyId },
        select: { id: true, name: true, email: true, phone: true, role: true },
        orderBy: { name: "asc" },
      });
      return NextResponse.json({ customers, employees });
    }

    return NextResponse.json({ customers });
  } catch {
    return unauthorizedResponse();
  }
}
