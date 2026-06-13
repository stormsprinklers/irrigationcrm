import { NextRequest, NextResponse } from "next/server";
import { Scope } from "@prisma/client";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const scopeParam = request.nextUrl.searchParams.get("scope") ?? "external";
    const scope = scopeParam === "internal" ? Scope.INTERNAL : Scope.EXTERNAL;

    const calls = await prisma.callLog.findMany({
      where: { companyId: user.companyId, scope },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        user: { select: { id: true, name: true } },
      },
      orderBy: { startedAt: "desc" },
      take: 100,
    });

    return NextResponse.json(calls);
  } catch {
    return unauthorizedResponse();
  }
}
