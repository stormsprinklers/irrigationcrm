import { NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN") return forbiddenResponse();

    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.integrationCredential.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updated = await prisma.integrationCredential.update({
      where: { id },
      data: {
        ...(body.enabled != null ? { enabled: Boolean(body.enabled) } : {}),
        ...(body.label != null ? { label: String(body.label).trim() || existing.label } : {}),
      },
      select: {
        id: true,
        type: true,
        label: true,
        keyPrefix: true,
        enabled: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json(updated);
  } catch {
    return unauthorizedResponse();
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN") return forbiddenResponse();

    const { id } = await params;
    const existing = await prisma.integrationCredential.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.integrationCredential.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return unauthorizedResponse();
  }
}
