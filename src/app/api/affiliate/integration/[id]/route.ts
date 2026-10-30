import { IntegrationType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import {
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser(request);
    if (user.role !== "AFFILIATE") return forbiddenResponse();
    const { id } = await params;
    const result = await prisma.integrationCredential.updateMany({
      where: {
        id,
        companyId: user.companyId,
        ownerUserId: user.id,
        type: IntegrationType.AFFILIATE,
      },
      data: { enabled: false },
    });
    if (!result.count) return NextResponse.json({ error: "API key not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return unauthorizedResponse();
  }
}
