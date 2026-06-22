import { NextRequest, NextResponse } from "next/server";
import { CampaignChannel } from "@prisma/client";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;

    const campaign = await prisma.campaign.findFirst({
      where: { id, companyId: user.companyId },
      select: { id: true },
    });
    if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const steps = await prisma.campaignStep.findMany({
      where: { campaignId: id },
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json({ steps });
  } catch {
    return unauthorizedResponse();
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const body = await request.json();
    const steps = body.steps;

    if (!Array.isArray(steps)) {
      return badRequestResponse("steps array is required");
    }

    const campaign = await prisma.campaign.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.$transaction([
      prisma.campaignStep.deleteMany({ where: { campaignId: id } }),
      prisma.campaignStep.createMany({
        data: steps.map(
          (
            step: {
              sortOrder?: number;
              channel?: CampaignChannel;
              subject?: string;
              bodyHtml?: string;
              bodyText: string;
              delayDays?: number;
            },
            index: number
          ) => ({
            campaignId: id,
            sortOrder: step.sortOrder ?? index,
            channel: step.channel ?? campaign.channel,
            subject: step.subject ?? null,
            bodyHtml: step.bodyHtml ?? null,
            bodyText: String(step.bodyText ?? ""),
            delayDays: step.delayDays ?? 0,
          })
        ),
      }),
    ]);

    const saved = await prisma.campaignStep.findMany({
      where: { campaignId: id },
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json({ steps: saved });
  } catch {
    return unauthorizedResponse();
  }
}
