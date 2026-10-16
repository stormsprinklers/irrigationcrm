import { NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const calls = await prisma.receptionistCall.findMany({
      where: { companyId: user.companyId },
      orderBy: { startedAt: "desc" },
      take: 50,
      select: {
        id: true,
        callSid: true,
        status: true,
        fromE164: true,
        toE164: true,
        summary: true,
        failureReason: true,
        startedAt: true,
        endedAt: true,
        customer: { select: { id: true, name: true } },
        tools: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            tool: true,
            resultCode: true,
            latencyMs: true,
            errorMessage: true,
            createdAt: true,
          },
        },
      },
    });

    return NextResponse.json({ calls });
  } catch {
    return unauthorizedResponse();
  }
}
