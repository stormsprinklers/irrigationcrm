import { NextRequest, NextResponse } from "next/server";
import { Division } from "@prisma/client";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canManageEmployees } from "@/lib/employees";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canManageEmployees(user.role)) return forbiddenResponse();

    const { id } = await params;
    const existing = await prisma.crew.findFirst({ where: { id, companyId: user.companyId } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();
    const crew = await prisma.crew.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: String(body.name) } : {}),
        ...(body.color !== undefined ? { color: String(body.color) } : {}),
        ...(body.division !== undefined ? { division: body.division as Division | null } : {}),
      },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, color: true, photoUrl: true } } },
        },
      },
    });

    return NextResponse.json(crew);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    return NextResponse.json({ error: "Failed to update crew" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canManageEmployees(user.role)) return forbiddenResponse();

    const { id } = await params;
    const existing = await prisma.crew.findFirst({
      where: { id, companyId: user.companyId },
      include: { _count: { select: { visits: true } } },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing._count.visits > 0) return badRequestResponse("Cannot delete crew with scheduled visits");

    await prisma.crew.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    return NextResponse.json({ error: "Failed to delete crew" }, { status: 500 });
  }
}
