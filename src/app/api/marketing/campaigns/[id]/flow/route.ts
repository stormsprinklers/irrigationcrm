import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { saveCampaignFlowNodes } from "@/lib/marketing/flow-engine";
import type { CampaignFlowNodeInput } from "@/lib/marketing/types";
import { prisma } from "@/lib/prisma";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const campaign = await prisma.campaign.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!campaign) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json();
    const nodes = (body.nodes ?? []) as CampaignFlowNodeInput[];
    const saved = await saveCampaignFlowNodes(id, nodes);
    return NextResponse.json({ nodes: saved });
  } catch {
    return unauthorizedResponse();
  }
}
