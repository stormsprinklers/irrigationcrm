import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalCustomer } from "@/lib/portal/auth";
import { activePublicCapability } from "@/lib/security/public-capability";
import {
  canCompleteEstimateVslGate,
  decodeEstimateVslGateToken,
} from "@/lib/portal/estimate-vsl";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    gateToken?: unknown;
    completedVideo?: unknown;
  };
  if (typeof body.gateToken !== "string") {
    return NextResponse.json({ error: "Video session is invalid. Refresh and try again." }, { status: 400 });
  }

  const ctx = await requirePortalCustomer();
  const estimate = await prisma.estimate.findFirst({
    where: ctx
      ? {
          companyId: ctx.companyId,
          customerId: ctx.customerId,
          OR: [{ id }, { publicToken: id }],
          status: { not: "DRAFT" },
        }
      : {
          ...activePublicCapability(id),
          status: { not: "DRAFT" },
          company: { portalEnabled: true },
        },
    select: {
      id: true,
      companyId: true,
      customerId: true,
      customer: { select: { estimateVslViewedAt: true } },
    },
  });
  if (!estimate) {
    return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
  }
  if (estimate.customer.estimateVslViewedAt) {
    return NextResponse.json({ ok: true, alreadyViewed: true });
  }

  const payload = decodeEstimateVslGateToken(body.gateToken);
  if (
    !payload ||
    payload.companyId !== estimate.companyId ||
    payload.customerId !== estimate.customerId ||
    payload.estimateId !== estimate.id
  ) {
    return NextResponse.json({ error: "Video session expired. Refresh and try again." }, { status: 400 });
  }
  if (
    !canCompleteEstimateVslGate({
      payload,
      completedVideo: body.completedVideo === true,
    })
  ) {
    return NextResponse.json({ error: "Please finish the required viewing time first." }, { status: 400 });
  }

  await prisma.customer.updateMany({
    where: {
      id: estimate.customerId,
      companyId: estimate.companyId,
      estimateVslViewedAt: null,
    },
    data: { estimateVslViewedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
