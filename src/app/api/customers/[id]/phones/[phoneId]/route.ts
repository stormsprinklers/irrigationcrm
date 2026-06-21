import { NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { normalizePhone } from "@/lib/inbox/contacts";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string; phoneId: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (user.role === "TECH") return forbiddenResponse();

    const { id: customerId, phoneId } = await params;
    const body = await request.json();

    const existing = await prisma.customerPhone.findFirst({
      where: { id: phoneId, customerId, companyId: user.companyId },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const updated = await prisma.customerPhone.update({
      where: { id: phoneId },
      data: {
        ...(body.phone !== undefined ? { phone: normalizePhone(String(body.phone)) } : {}),
        ...(body.note !== undefined ? { note: body.note?.trim() || null } : {}),
      },
    });

    return NextResponse.json({
      id: updated.id,
      phone: updated.phone,
      note: updated.note,
      createdAt: updated.createdAt.toISOString(),
    });
  } catch {
    return unauthorizedResponse();
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (user.role === "TECH") return forbiddenResponse();

    const { id: customerId, phoneId } = await params;
    await prisma.customerPhone.deleteMany({
      where: { id: phoneId, customerId, companyId: user.companyId },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return unauthorizedResponse();
  }
}
