import { NextRequest, NextResponse } from "next/server";
import { forbiddenForFieldRole, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { writeStaffAuditLog } from "@/lib/audit/staff-audit";
import { prisma } from "@/lib/prisma";
import { rotatePublicCapability } from "@/lib/security/public-capability";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const fieldDenied = forbiddenForFieldRole(user.role);
    if (fieldDenied) return fieldDenied;

    const { id } = await params;
    const estimate = await prisma.estimate.findFirst({
      where: { id, companyId: user.companyId },
      select: { id: true, customerId: true, publicTokenVersion: true },
    });
    if (!estimate) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const capability = rotatePublicCapability(estimate.publicTokenVersion);
    await prisma.estimate.updateMany({
      where: { id: estimate.id, publicTokenVersion: estimate.publicTokenVersion },
      data: capability,
    });
    const updated = await prisma.estimate.findUniqueOrThrow({
      where: { id: estimate.id },
      select: {
        publicToken: true,
        publicTokenExpiresAt: true,
        publicTokenVersion: true,
      },
    });
    await writeStaffAuditLog({
      companyId: user.companyId,
      actorId: user.id,
      entityType: "Estimate",
      entityId: estimate.id,
      customerId: estimate.customerId,
      action: "PUBLIC_LINK_ROTATED",
      field: "publicTokenVersion",
      before: estimate.publicTokenVersion,
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
    const fieldDenied = forbiddenForFieldRole(user.role);
    if (fieldDenied) return fieldDenied;

    const { id } = await params;
    const revokedAt = new Date();
    const result = await prisma.estimate.updateMany({
      where: { id, companyId: user.companyId },
      data: { publicTokenRevokedAt: revokedAt },
    });
    if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await writeStaffAuditLog({
      companyId: user.companyId,
      actorId: user.id,
      entityType: "Estimate",
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
