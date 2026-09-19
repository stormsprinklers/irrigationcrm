import {
  CampaignEnrollmentStatus,
  CampaignFlowNodeType,
  CampaignStatus,
  CampaignType,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { queryAudienceCustomersForChannels } from "@/lib/marketing/audience";
import { campaignFlowChannels } from "@/lib/marketing/flow-channels";
import { scheduleOrHoldCampaignSend } from "@/lib/marketing/quiet-hours-notify";
import type { AudienceFilters } from "@/lib/marketing/types";

type EnrollmentForAudiencePlan = {
  id: string;
  customerId: string;
  status: CampaignEnrollmentStatus;
  removedByAudience: boolean;
};

export function planCampaignAudienceReconciliation(
  enrollments: EnrollmentForAudiencePlan[],
  eligibleCustomerIds: string[]
) {
  const eligible = new Set(eligibleCustomerIds);
  const enrolledCustomers = new Set(enrollments.map((row) => row.customerId));

  return {
    removeEnrollmentIds: enrollments
      .filter(
        (row) =>
          !eligible.has(row.customerId) &&
          (row.status === CampaignEnrollmentStatus.ACTIVE ||
            row.status === CampaignEnrollmentStatus.PAUSED)
      )
      .map((row) => row.id),
    restoreEnrollmentIds: enrollments
      .filter(
        (row) =>
          eligible.has(row.customerId) &&
          row.status === CampaignEnrollmentStatus.CANCELLED &&
          row.removedByAudience
      )
      .map((row) => row.id),
    addCustomerIds: eligibleCustomerIds.filter((id) => !enrolledCustomers.has(id)),
  };
}

function configRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Apply a saved manual audience to a live campaign without restarting people who
 * are already moving through the flow. Sent message and enrollment history stays intact.
 */
export async function reconcileActiveCampaignAudience(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      company: { select: { timezone: true } },
      flowNodes: { orderBy: { sortOrder: "asc" } },
      enrollments: {
        select: {
          id: true,
          customerId: true,
          status: true,
          events: {
            where: { eventType: "audience_removed" },
            select: { id: true },
            take: 1,
          },
        },
      },
    },
  });

  if (
    !campaign ||
    campaign.status !== CampaignStatus.ACTIVE ||
    campaign.type !== CampaignType.DRIP
  ) {
    return { added: 0, removed: 0, restored: 0 };
  }

  const trigger = campaign.flowNodes.find(
    (node) => node.type === CampaignFlowNodeType.TRIGGER
  );
  if (String(configRecord(trigger?.config).kind ?? "manual_audience") !== "manual_audience") {
    return { added: 0, removed: 0, restored: 0 };
  }

  const channels = campaignFlowChannels(campaign.flowNodes);
  const eligibleCustomers = await queryAudienceCustomersForChannels(
    campaign.companyId,
    channels.length ? channels : [campaign.channel],
    campaign.audienceFilters as AudienceFilters | null
  );
  const plan = planCampaignAudienceReconciliation(
    campaign.enrollments.map((row) => ({
      id: row.id,
      customerId: row.customerId,
      status: row.status,
      removedByAudience: row.events.length > 0,
    })),
    eligibleCustomers.map((row) => row.id)
  );

  const triggerIndex = trigger
    ? campaign.flowNodes.findIndex((node) => node.id === trigger.id)
    : -1;
  const explicitEntryId = configRecord(trigger?.config).nextId;
  const entryNode =
    (typeof explicitEntryId === "string"
      ? campaign.flowNodes.find((node) => node.id === explicitEntryId)
      : null) ??
    (triggerIndex >= 0 ? campaign.flowNodes[triggerIndex + 1] : null) ??
    campaign.flowNodes.find((node) => node.type !== CampaignFlowNodeType.TRIGGER) ??
    campaign.flowNodes[0];

  if (!entryNode && (plan.addCustomerIds.length || plan.restoreEnrollmentIds.length)) {
    throw new Error("The campaign needs a step before customers can be added");
  }

  const resumeAt =
    plan.addCustomerIds.length || plan.restoreEnrollmentIds.length
      ? await scheduleOrHoldCampaignSend({
          companyId: campaign.companyId,
          campaignId: campaign.id,
          campaignName: campaign.name,
          timeZone: campaign.company.timezone,
        })
      : null;

  const removedCustomerIds = new Set(
    campaign.enrollments
      .filter((row) => plan.removeEnrollmentIds.includes(row.id))
      .map((row) => row.customerId)
  );

  await prisma.$transaction(async (tx) => {
    if (plan.removeEnrollmentIds.length) {
      await tx.campaignEnrollment.updateMany({
        where: {
          id: { in: plan.removeEnrollmentIds },
          status: {
            in: [CampaignEnrollmentStatus.ACTIVE, CampaignEnrollmentStatus.PAUSED],
          },
        },
        data: { status: CampaignEnrollmentStatus.CANCELLED },
      });
      await tx.campaignEnrollmentEvent.createMany({
        data: plan.removeEnrollmentIds.map((enrollmentId) => ({
          enrollmentId,
          eventType: "audience_removed",
        })),
      });
      // Pending rows have never been sent, so removing them prevents a queued send
      // while preserving all sent and delivered history.
      await tx.campaignRecipient.deleteMany({
        where: {
          campaignId: campaign.id,
          customerId: { in: [...removedCustomerIds] },
          status: "pending",
        },
      });
    }

    if (plan.restoreEnrollmentIds.length && resumeAt) {
      await tx.campaignEnrollment.updateMany({
        where: {
          id: { in: plan.restoreEnrollmentIds },
          status: CampaignEnrollmentStatus.CANCELLED,
        },
        data: {
          status: CampaignEnrollmentStatus.ACTIVE,
          nextSendAt: resumeAt,
        },
      });
      await tx.campaignEnrollmentEvent.createMany({
        data: plan.restoreEnrollmentIds.map((enrollmentId) => ({
          enrollmentId,
          eventType: "audience_restored",
        })),
      });
    }

    if (plan.addCustomerIds.length && resumeAt && entryNode) {
      await tx.campaignEnrollment.createMany({
        data: plan.addCustomerIds.map((customerId) => ({
          campaignId: campaign.id,
          customerId,
          currentStepIndex: 0,
          currentNodeId: entryNode.id,
          nextSendAt: resumeAt,
          status: CampaignEnrollmentStatus.ACTIVE,
        })),
        skipDuplicates: true,
      });
    }
  }, { timeout: 15_000 });

  return {
    added: plan.addCustomerIds.length,
    removed: plan.removeEnrollmentIds.length,
    restored: plan.restoreEnrollmentIds.length,
  };
}
