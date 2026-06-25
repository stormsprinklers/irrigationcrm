import { NextRequest, NextResponse } from "next/server";
import { forbiddenForFieldRole, badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse, } from "@/lib/api-auth";
import { normalizePhone } from "@/lib/inbox/contacts";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const phones = await prisma.customerPhone.findMany({
      where: { customerId: id, companyId: user.companyId },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(
      phones.map((p) => ({
        id: p.id,
        phone: p.phone,
        note: p.note,
        createdAt: p.createdAt.toISOString(),
      }))
    );
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const fieldDenied = forbiddenForFieldRole(user.role); if (fieldDenied) return fieldDenied;

    const { id: customerId } = await params;
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, companyId: user.companyId },
    });
    if (!customer) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();
    const phoneRaw = body.phone?.trim();
    if (!phoneRaw) return badRequestResponse("phone is required");

    const phone = normalizePhone(phoneRaw);
    const created = await prisma.customerPhone.create({
      data: {
        companyId: user.companyId,
        customerId,
        phone,
        note: body.note?.trim() || null,
      },
    });

    return NextResponse.json(
      {
        id: created.id,
        phone: created.phone,
        note: created.note,
        createdAt: created.createdAt.toISOString(),
      },
      { status: 201 }
    );
  } catch {
    return unauthorizedResponse();
  }
}
