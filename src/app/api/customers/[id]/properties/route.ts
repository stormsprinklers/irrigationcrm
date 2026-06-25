import { NextRequest, NextResponse } from "next/server";
import { forbiddenForFieldRole, badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { listCustomerProperties, serializeProperty } from "@/lib/customers/queries";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

async function assertCustomer(companyId: string, customerId: string) {
  return prisma.customer.findFirst({ where: { id: customerId, companyId } });
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    if (!(await assertCustomer(user.companyId, id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const properties = await listCustomerProperties(user.companyId, id);
    return NextResponse.json(properties.map(serializeProperty));
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const fieldDenied = forbiddenForFieldRole(user.role); if (fieldDenied) return fieldDenied;

    const { id } = await params;
    if (!(await assertCustomer(user.companyId, id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json();
    if (!body.name?.trim()) return badRequestResponse("name is required");

    if (body.isPrimary) {
      await prisma.customerProperty.updateMany({
        where: { customerId: id, companyId: user.companyId },
        data: { isPrimary: false },
      });
    }

    const property = await prisma.customerProperty.create({
      data: {
        companyId: user.companyId,
        customerId: id,
        name: String(body.name).trim(),
        address: body.address ?? null,
        city: body.city ?? null,
        state: body.state ?? null,
        zip: body.zip ?? null,
        isPrimary: Boolean(body.isPrimary),
      },
    });

    return NextResponse.json(serializeProperty(property), { status: 201 });
  } catch {
    return unauthorizedResponse();
  }
}
