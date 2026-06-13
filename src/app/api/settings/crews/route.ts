import { NextRequest, NextResponse } from "next/server";
import { Division } from "@prisma/client";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canManageEmployees } from "@/lib/employees";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const crews = await prisma.crew.findMany({
      where: { companyId: user.companyId },
      orderBy: { name: "asc" },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, color: true, photoUrl: true } } },
        },
        _count: { select: { jobs: true } },
      },
    });
    return NextResponse.json(crews);
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canManageEmployees(user.role)) return forbiddenResponse();

    const body = await request.json();
    if (!body.name) return badRequestResponse("Name is required");

    const crew = await prisma.crew.create({
      data: {
        companyId: user.companyId,
        name: String(body.name),
        color: body.color ?? "#16A34A",
        division: body.division ?? null,
      },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, color: true, photoUrl: true } } },
        },
      },
    });

    return NextResponse.json(crew, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    return NextResponse.json({ error: "Failed to create crew" }, { status: 500 });
  }
}
