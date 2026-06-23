import { NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (user.role === "TECH") return forbiddenResponse();

    const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
    if (q.length < 2) {
      return NextResponse.json({ customers: [] });
    }

    const customers = await prisma.customer.findMany({
      where: {
        companyId: user.companyId,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
          { phone: { contains: q, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        properties: {
          select: { id: true, name: true, address: true },
          orderBy: { isPrimary: "desc" },
          take: 5,
        },
      },
      take: 20,
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ customers });
  } catch {
    return unauthorizedResponse();
  }
}
