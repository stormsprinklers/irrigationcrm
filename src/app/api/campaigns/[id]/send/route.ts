import { NextRequest, NextResponse } from "next/server";
import { CampaignStatus } from "@prisma/client";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { sendCampaign } from "@/lib/campaigns/send";
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

    if (campaign.status === CampaignStatus.SENDING) {
      return NextResponse.json({ error: "Campaign is already sending" }, { status: 409 });
    }
    if (campaign.status === CampaignStatus.COMPLETED) {
      return NextResponse.json({ error: "Campaign already completed" }, { status: 409 });
    }

    const stats = await sendCampaign(id);
    return NextResponse.json({ stats });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Send failed" },
      { status: 500 }
    );
  }
}
