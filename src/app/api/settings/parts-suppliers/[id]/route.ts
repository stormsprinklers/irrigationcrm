import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { canManageEmployees } from "@/lib/employees";
import { prisma } from "@/lib/prisma";
import { getPlaceDetails, placeToSupplierData } from "@/lib/parts-suppliers/places";
import { serializePartsSupplier } from "@/lib/parts-suppliers/serialize";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    if (!canManageEmployees(user.role)) return forbiddenResponse();

    const { id } = await context.params;
    const body = await request.json();

    const existing = await prisma.partsSupplier.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const supplier = await prisma.partsSupplier.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: String(body.name) } : {}),
        ...(body.isActive !== undefined ? { isActive: Boolean(body.isActive) } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: Number(body.sortOrder) } : {}),
      },
    });

    return NextResponse.json(serializePartsSupplier(supplier));
  } catch {
    return unauthorizedResponse();
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    if (!canManageEmployees(user.role)) return forbiddenResponse();

    const { id } = await context.params;
    const existing = await prisma.partsSupplier.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.partsSupplier.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    if (!canManageEmployees(user.role)) return forbiddenResponse();

    const { id } = await context.params;
    const existing = await prisma.partsSupplier.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (!existing.googlePlaceId) {
      return badRequestResponse("Supplier has no Google Place ID to sync");
    }

    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: { timezone: true },
    });

    const place = await getPlaceDetails(existing.googlePlaceId);
    const supplier = await prisma.partsSupplier.update({
      where: { id },
      data: placeToSupplierData(place, company?.timezone ?? existing.timezone),
    });

    return NextResponse.json(serializePartsSupplier(supplier));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
