import { NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

type FreezeStatus = {
  disabled: boolean;
  reason: string | null;
  disabledAt: string | null;
  disabledByName: string | null;
  canManage: boolean;
};

async function buildStatus(companyId: string, role: string): Promise<FreezeStatus> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      outboundCommsDisabled: true,
      outboundCommsDisabledReason: true,
      outboundCommsDisabledAt: true,
      outboundCommsDisabledById: true,
    },
  });

  let disabledByName: string | null = null;
  if (company?.outboundCommsDisabledById) {
    const actor = await prisma.user.findUnique({
      where: { id: company.outboundCommsDisabledById },
      select: { name: true },
    });
    disabledByName = actor?.name ?? null;
  }

  return {
    disabled: Boolean(company?.outboundCommsDisabled),
    reason: company?.outboundCommsDisabledReason ?? null,
    disabledAt: company?.outboundCommsDisabledAt?.toISOString() ?? null,
    disabledByName,
    canManage: role === "ADMIN",
  };
}

export async function GET() {
  try {
    const user = await requireSessionUser();
    return NextResponse.json(await buildStatus(user.companyId, user.role));
  } catch {
    return unauthorizedResponse();
  }
}

export async function PATCH(request: NextRequest) {
  let user;
  try {
    user = await requireSessionUser();
  } catch {
    return unauthorizedResponse();
  }

  if (user.role !== "ADMIN") {
    return forbiddenResponse("Only administrators can change outbound communication settings.");
  }

  const body = (await request.json().catch(() => ({}))) as {
    disabled?: boolean;
    reason?: string;
  };

  if (typeof body.disabled !== "boolean") {
    return NextResponse.json({ error: "`disabled` must be a boolean" }, { status: 400 });
  }

  const reason = body.disabled ? (body.reason?.trim() || null) : null;

  await prisma.company.update({
    where: { id: user.companyId },
    data: {
      outboundCommsDisabled: body.disabled,
      outboundCommsDisabledReason: reason,
      outboundCommsDisabledAt: body.disabled ? new Date() : null,
      outboundCommsDisabledById: body.disabled ? user.id : null,
    },
  });

  return NextResponse.json(await buildStatus(user.companyId, user.role));
}
