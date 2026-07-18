import { NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canManageEmployees } from "@/lib/employees";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canManageEmployees(user.role)) return forbiddenResponse();

    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.serviceArea.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const area = await prisma.serviceArea.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: String(body.name) } : {}),
        ...(body.color !== undefined ? { color: String(body.color) } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: Number(body.sortOrder) } : {}),
      },
    });

    return NextResponse.json(area);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    return NextResponse.json({ error: "Failed to update service area" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canManageEmployees(user.role)) return forbiddenResponse();

    const { id } = await params;
    const existing = await prisma.serviceArea.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Visits keep their address zip; serviceAreaId is SetNull via FK when this area is removed.
    // Re-link any visits whose zip still matches a remaining area (e.g. after zip moves).
    const visits = await prisma.visit.findMany({
      where: { companyId: user.companyId, serviceAreaId: id },
      select: { id: true, zip: true, property: { select: { zip: true } } },
    });

    await prisma.$transaction(async (tx) => {
      for (const visit of visits) {
        const zip = visit.zip || visit.property?.zip;
        if (!zip) continue;
        const zipCode = zip.replace(/\D/g, "").slice(0, 5);
        if (zipCode.length !== 5) continue;
        const match = await tx.serviceAreaZip.findFirst({
          where: {
            zipCode,
            serviceArea: { companyId: user.companyId, id: { not: id } },
          },
          select: { serviceAreaId: true },
        });
        if (match) {
          await tx.visit.update({
            where: { id: visit.id },
            data: { serviceAreaId: match.serviceAreaId },
          });
        }
      }
      await tx.serviceArea.delete({ where: { id } });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Delete service area failed", error);
    return NextResponse.json({ error: "Failed to delete service area" }, { status: 500 });
  }
}
