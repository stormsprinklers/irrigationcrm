import { NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { writeStaffAuditLog } from "@/lib/audit/staff-audit";
import { canAccessInvoices } from "@/lib/invoices/permissions";
import { prisma } from "@/lib/prisma";
import { rotatePublicCapability } from "@/lib/security/public-capability";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canAccessInvoices(user.role)) return forbiddenResponse();

    const { id } = await params;
    const invoice = await prisma.invoice.findFirst({
      where: { id, companyId: user.companyId },
      select: { id: true, customerId: true, publicTokenVersion: true },
    });
    if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const capability = rotatePublicCapability(invoice.publicTokenVersion);
    await prisma.invoice.updateMany({
      where: { id: invoice.id, publicTokenVersion: invoice.publicTokenVersion },
      data: capability,
    });
    const updated = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
      select: {
        publicToken: true,
        publicTokenExpiresAt: true,
        publicTokenVersion: true,
      },
    });
    await writeStaffAuditLog({
      companyId: user.companyId,
      actorId: user.id,
      entityType: "Invoice",
      entityId: invoice.id,
      customerId: invoice.customerId,
      action: "PUBLIC_LINK_ROTATED",
      field: "publicTokenVersion",
      before: invoice.publicTokenVersion,
      after: updated.publicTokenVersion,
    });
    return NextResponse.json(updated);
  } catch {
    return unauthorizedResponse();
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canAccessInvoices(user.role)) return forbiddenResponse();

    const { id } = await params;
    const revokedAt = new Date();
    const result = await prisma.invoice.updateMany({
      where: { id, companyId: user.companyId },
      data: { publicTokenRevokedAt: revokedAt },
    });
    if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await writeStaffAuditLog({
      companyId: user.companyId,
      actorId: user.id,
      entityType: "Invoice",
      entityId: id,
      action: "PUBLIC_LINK_REVOKED",
      field: "publicTokenRevokedAt",
      after: revokedAt.toISOString(),
    });
    return NextResponse.json({ ok: true, revokedAt });
  } catch {
    return unauthorizedResponse();
  }
}
