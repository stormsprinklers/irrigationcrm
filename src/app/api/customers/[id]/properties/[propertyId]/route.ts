import { NextRequest, NextResponse } from "next/server";
import { forbiddenForFieldRole, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
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

    if (body.isPrimary) {
      await prisma.customerProperty.updateMany({
        where: { customerId: id, companyId: user.companyId },
        data: { isPrimary: false },
      });
    }

    const property = await prisma.customerProperty.update({
      where: { id: propertyId },
      data: {
        ...(body.name !== undefined ? { name: String(body.name) } : {}),
        ...(body.address !== undefined ? { address: body.address ?? null } : {}),
        ...(body.city !== undefined ? { city: body.city ?? null } : {}),
        ...(body.state !== undefined ? { state: body.state ?? null } : {}),
        ...(body.zip !== undefined ? { zip: body.zip ?? null } : {}),
        ...(body.isPrimary !== undefined ? { isPrimary: Boolean(body.isPrimary) } : {}),
      },
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
    const result = await prisma.customerProperty.deleteMany({
      where: { id: propertyId, customerId: id, companyId: user.companyId },
    });

    if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return unauthorizedResponse();
  }
}
