import {
  CampaignEnrollmentStatus,
  CampaignStatus,
  CampaignType,
  Prisma,
} from "@prisma/client";
import { remapFlowNextIds } from "@/lib/marketing/if-else";
import { isCampaignEditable } from "@/lib/marketing/campaign-lifecycle";
import { prisma } from "@/lib/prisma";

export async function duplicateCampaign(companyId: string, campaignId: string) {
  const source = await prisma.campaign.findFirst({
    where: { id: campaignId, companyId },
    include: {
      steps: { orderBy: { sortOrder: "asc" } },
      flowNodes: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!source) return null;

  const copy = await prisma.campaign.create({
    data: {
      companyId,
      name: source.name.startsWith("Copy of ") ? source.name : `Copy of ${source.name}`,
      type: source.type,
      channel: source.channel,
      status: CampaignStatus.DRAFT,
      subject: source.subject,
      bodyHtml: source.bodyHtml,
      bodyText: source.bodyText,
      listId: source.listId,
      audienceFilters: source.audienceFilters ?? undefined,
      aiPrompt: source.aiPrompt,
      dripSettings: source.dripSettings ?? undefined,
      scheduledAt: null,
      sentAt: null,
      statsJson: Prisma.JsonNull,
    },
  });

  if (source.steps.length > 0) {
    await prisma.campaignStep.createMany({
      data: source.steps.map((step) => ({
        campaignId: copy.id,
        sortOrder: step.sortOrder,
        channel: step.channel,
        subject: step.subject,
        bodyHtml: step.bodyHtml,
        bodyText: step.bodyText,
        delayDays: step.delayDays,
      })),
    });
  }

  if (source.flowNodes.length > 0) {
    const idMap = new Map<string, string>();
    const created = [];
    for (const node of source.flowNodes) {
      const row = await prisma.campaignFlowNode.create({
        data: {
          campaignId: copy.id,
          type: node.type,
          config: node.config as Prisma.InputJsonValue,
          sortOrder: node.sortOrder,
        },
      });
      idMap.set(node.id, row.id);
      created.push(row);
    }
    for (const row of created) {
      const config = remapFlowNextIds(
        (row.config && typeof row.config === "object" ? row.config : {}) as Record<string, unknown>,
        idMap
      );
      await prisma.campaignFlowNode.update({
        where: { id: row.id },
        data: { config: config as Prisma.InputJsonValue },
      });
    }
  }

  return copy;
}

export async function archiveCampaign(companyId: string, campaignId: string) {
  const existing = await prisma.campaign.findFirst({
    where: { id: campaignId, companyId },
  });
  if (!existing) return null;
  if (existing.status === CampaignStatus.ARCHIVED) return existing;

  if (existing.type === CampaignType.DRIP && existing.status === CampaignStatus.ACTIVE) {
    await prisma.campaignEnrollment.updateMany({
      where: { campaignId, status: CampaignEnrollmentStatus.ACTIVE },
      data: { status: CampaignEnrollmentStatus.CANCELLED },
    });
  }

  return prisma.campaign.update({
    where: { id: campaignId },
    data: { status: CampaignStatus.ARCHIVED },
  });
}

export async function unarchiveCampaign(companyId: string, campaignId: string) {
  const existing = await prisma.campaign.findFirst({
    where: { id: campaignId, companyId },
  });
  if (!existing) return null;
  if (existing.status !== CampaignStatus.ARCHIVED) return existing;
  return prisma.campaign.update({
    where: { id: campaignId },
    data: { status: CampaignStatus.DRAFT },
  });
}

export function assertCampaignEditable(status: CampaignStatus) {
  if (!isCampaignEditable(status)) {
    throw new Error("This campaign is closed and can no longer be edited. Duplicate it to make a new one.");
  }
}
