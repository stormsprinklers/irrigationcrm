import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/api-auth";
import { processFlowEnrollments } from "@/lib/marketing/flow-engine";
import { outboundCommsErrorResponse } from "@/lib/communications/outbound-guard";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;

    const campaign = await prisma.campaign.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (campaign.type !== "DRIP") {
      return NextResponse.json({ error: "Only automation campaigns can be processed" }, { status: 400 });
    }
    if (campaign.status !== "ACTIVE") {
      return NextResponse.json({ error: "Activate the campaign before sending due steps" }, { status: 400 });
    }

    const result = await processFlowEnrollments({ campaignId: id, limit: 40 });
    return NextResponse.json(result);
  } catch (err) {
    const commsDisabled = outboundCommsErrorResponse(err);
    if (commsDisabled) return commsDisabled;
    const message = err instanceof Error ? err.message : "Processing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
