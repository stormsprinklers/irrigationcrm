import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenForFieldRole,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { serializeProperty } from "@/lib/customers/queries";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string; propertyId: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const fieldDenied = forbiddenForFieldRole(user.role); if (fieldDenied) return fieldDenied;

    const { id, propertyId } = await params;
    const existing = await prisma.customerProperty.findFirst({
      where: { id: propertyId, customerId: id, companyId: user.companyId },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();
    const name = body.name === undefined ? undefined : String(body.name).trim();
    if (name !== undefined && !name) return badRequestResponse("name is required");
    const nextIsPrimary =
      body.isPrimary === undefined ? undefined : existing.isPrimary || Boolean(body.isPrimary);

    const property = await prisma.$transaction(async (tx) => {
      if (nextIsPrimary && !existing.isPrimary) {
        await tx.customerProperty.updateMany({
          where: { customerId: id, companyId: user.companyId },
          data: { isPrimary: false },
        });
      }

      return tx.customerProperty.update({
        where: { id: propertyId },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(body.address !== undefined ? { address: body.address ?? null } : {}),
          ...(body.city !== undefined ? { city: body.city ?? null } : {}),
          ...(body.state !== undefined ? { state: body.state ?? null } : {}),
          ...(body.zip !== undefined ? { zip: body.zip ?? null } : {}),
          ...(body.latitude !== undefined
            ? { latitude: body.latitude == null ? null : Number(body.latitude) }
            : {}),
          ...(body.longitude !== undefined
            ? { longitude: body.longitude == null ? null : Number(body.longitude) }
            : {}),
          ...(nextIsPrimary !== undefined ? { isPrimary: nextIsPrimary } : {}),
        },
      });
    });

    return NextResponse.json(serializeProperty(property));
  } catch {
    return unauthorizedResponse();
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const fieldDenied = forbiddenForFieldRole(user.role); if (fieldDenied) return fieldDenied;

    const { id, propertyId } = await params;
    const existing = await prisma.customerProperty.findFirst({
      where: { id: propertyId, customerId: id, companyId: user.companyId },
      select: { id: true, isPrimary: true },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.$transaction(async (tx) => {
      await tx.customerProperty.delete({ where: { id: existing.id } });
      if (!existing.isPrimary) return;

      const nextPrimary = await tx.customerProperty.findFirst({
        where: { customerId: id, companyId: user.companyId },
        orderBy: { name: "asc" },
        select: { id: true },
      });
      if (nextPrimary) {
        await tx.customerProperty.update({
          where: { id: nextPrimary.id },
          data: { isPrimary: true },
        });
      }
    });
    return NextResponse.json({ ok: true });
  } catch {
    return unauthorizedResponse();
  }
}
