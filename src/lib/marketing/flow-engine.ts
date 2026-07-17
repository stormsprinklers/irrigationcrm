import {
  CampaignChannel,
  CampaignEnrollmentStatus,
  CampaignFlowNodeType,
  CampaignStatus,
  CampaignType,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { queryAudienceCustomers } from "@/lib/marketing/audience";
import type { AudienceFilters, CampaignFlowNodeInput, DripSettings } from "@/lib/marketing/types";
import { sendCampaignMessage } from "@/lib/marketing/flow-send";

type FlowNodeRow = {
  id: string;
  type: CampaignFlowNodeType;
  config: Record<string, unknown>;
  sortOrder: number;
};

function asConfig(value: unknown): Record<string, unknown> {
  return (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
}

/** Convert legacy linear CampaignStep rows into flow nodes for the editor. */
export function stepsToFlowNodes(
  steps: Array<{
    id?: string;
    sortOrder: number;
    channel: CampaignChannel;
    subject?: string | null;
    bodyHtml?: string | null;
    bodyText: string;
    delayDays?: number;
  }>
): CampaignFlowNodeInput[] {
  const nodes: CampaignFlowNodeInput[] = [
    {
      id: `legacy-trigger`,
      type: "TRIGGER",
      sortOrder: 0,
      config: { kind: "manual_audience" },
    },
  ];
  let order = 1;
  for (const step of steps) {
    if ((step.delayDays ?? 0) > 0) {
      nodes.push({
        id: `legacy-wait-${step.sortOrder}`,
        type: "WAIT",
        sortOrder: order++,
        config: { mode: "delay", delayHours: (step.delayDays ?? 0) * 24 },
      });
    }
    nodes.push({
      id: step.id ?? `legacy-send-${step.sortOrder}`,
      type: step.channel === "SMS" ? "SEND_SMS" : "SEND_EMAIL",
      sortOrder: order++,
      config: {
        subject: step.subject ?? "",
        bodyHtml: step.bodyHtml ?? "",
        bodyText: step.bodyText,
      },
    });
  }
  return nodes;
}

export async function saveCampaignFlowNodes(
  campaignId: string,
  nodes: CampaignFlowNodeInput[]
) {
  await prisma.campaignFlowNode.deleteMany({ where: { campaignId } });
  if (nodes.length === 0) return [];

  const created = [];
  for (const [index, node] of nodes.entries()) {
    const useId =
      node.id && !node.id.startsWith("tmp-") && !node.id.startsWith("legacy-")
        ? node.id
        : undefined;
    const row = await prisma.campaignFlowNode.create({
      data: {
        ...(useId ? { id: useId } : {}),
        campaignId,
        type: node.type as CampaignFlowNodeType,
        config: node.config as Prisma.InputJsonValue,
        sortOrder: index,
      },
    });
    created.push(row);
  }
  return created;
}

export async function activateFlowCampaign(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      flowNodes: { orderBy: { sortOrder: "asc" } },
      steps: { orderBy: { sortOrder: "asc" } },
      company: true,
    },
  });
  if (!campaign) throw new Error("Campaign not found");
  if (campaign.type !== CampaignType.DRIP) throw new Error("Not an automation campaign");

  const { assertOutboundCommsEnabled } = await import(
    "@/lib/communications/outbound-guard"
  );
  await assertOutboundCommsEnabled(
    campaign.companyId,
    campaign.channel === CampaignChannel.SMS ? "sms" : "email"
  );

  let flowNodes = campaign.flowNodes;
  if (flowNodes.length === 0 && campaign.steps.length > 0) {
    const migrated = stepsToFlowNodes(campaign.steps);
    flowNodes = await saveCampaignFlowNodes(campaignId, migrated);
  }
  if (flowNodes.length === 0) throw new Error("Add at least one automation step");

  const dripSettings = (campaign.dripSettings ?? {}) as DripSettings;
  const filters = campaign.audienceFilters as AudienceFilters | null;
  const trigger = flowNodes.find((n) => n.type === CampaignFlowNodeType.TRIGGER);
  const triggerKind = asConfig(trigger?.config).kind ?? "manual_audience";

  let customers: Array<{ id: string; email: string | null; phone: string | null }> = [];
  if (triggerKind === "manual_audience" || !trigger) {
    customers = await queryAudienceCustomers(
      campaign.companyId,
      campaign.channel,
      filters
    );
  }

  const startAt = dripSettings.startAt ? new Date(dripSettings.startAt) : new Date();
  const entryNode =
    flowNodes.find((n) => n.type !== CampaignFlowNodeType.TRIGGER) ?? flowNodes[0];

  await prisma.campaignEnrollment.deleteMany({ where: { campaignId } });

  for (const customer of customers) {
    await prisma.campaignEnrollment.create({
      data: {
        campaignId,
        customerId: customer.id,
        currentStepIndex: 0,
        currentNodeId: entryNode.id,
        nextSendAt: startAt,
        status: CampaignEnrollmentStatus.ACTIVE,
      },
    });
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: CampaignStatus.ACTIVE },
  });

  return { enrolled: customers.length };
}

async function logEvent(
  enrollmentId: string,
  nodeId: string | null,
  eventType: string,
  meta?: Record<string, unknown>
) {
  await prisma.campaignEnrollmentEvent.create({
    data: {
      enrollmentId,
      nodeId,
      eventType,
      meta: (meta ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

function nextLinearNode(nodes: FlowNodeRow[], currentId: string): FlowNodeRow | null {
  const idx = nodes.findIndex((n) => n.id === currentId);
  if (idx < 0) return null;
  return nodes[idx + 1] ?? null;
}

function findNode(nodes: FlowNodeRow[], id: string | null | undefined): FlowNodeRow | null {
  if (!id) return null;
  return nodes.find((n) => n.id === id) ?? null;
}

export async function processFlowEnrollments(limit = 40) {
  const due = await prisma.campaignEnrollment.findMany({
    where: {
      status: CampaignEnrollmentStatus.ACTIVE,
      nextSendAt: { lte: new Date() },
      campaign: { status: CampaignStatus.ACTIVE, type: CampaignType.DRIP },
    },
    include: {
      campaign: {
        include: {
          company: true,
          flowNodes: { orderBy: { sortOrder: "asc" } },
        },
      },
      customer: true,
    },
    take: limit,
    orderBy: { nextSendAt: "asc" },
  });

  let processed = 0;

  for (const enrollment of due) {
    const nodes = enrollment.campaign.flowNodes.map((n) => ({
      id: n.id,
      type: n.type,
      config: asConfig(n.config),
      sortOrder: n.sortOrder,
    }));
    if (nodes.length === 0) continue;

    // Daily rate limits
    const settings = (enrollment.campaign.dripSettings ?? {}) as DripSettings;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const sentToday = await prisma.campaignRecipient.count({
      where: {
        campaignId: enrollment.campaignId,
        sentAt: { gte: startOfDay },
        status: { in: ["sent", "delivered"] },
      },
    });

    let node =
      findNode(nodes, enrollment.currentNodeId) ??
      nodes.find((n) => n.type !== CampaignFlowNodeType.TRIGGER) ??
      nodes[0];

    // Skip TRIGGER nodes at runtime
    if (node.type === CampaignFlowNodeType.TRIGGER) {
      node = nextLinearNode(nodes, node.id) ?? node;
    }

    if (node.type === CampaignFlowNodeType.WAIT) {
      const waited = await prisma.campaignEnrollmentEvent.findFirst({
        where: { enrollmentId: enrollment.id, nodeId: node.id, eventType: "wait_started" },
        orderBy: { createdAt: "desc" },
      });

      if (!waited) {
        const mode = String(node.config.mode ?? "delay");
        let when = new Date();
        if (mode === "date" && node.config.sendAt) {
          when = new Date(String(node.config.sendAt));
        } else {
          const hours = Number(node.config.delayHours ?? 0);
          when = new Date(Date.now() + hours * 60 * 60 * 1000);
        }
        await logEvent(enrollment.id, node.id, "wait_started", { when: when.toISOString() });
        await prisma.campaignEnrollment.update({
          where: { id: enrollment.id },
          data: { nextSendAt: when },
        });
        processed++;
        continue;
      }

      const next = nextLinearNode(nodes, node.id);
      await logEvent(enrollment.id, node.id, "wait_completed");
      if (!next) {
        await prisma.campaignEnrollment.update({
          where: { id: enrollment.id },
          data: { status: CampaignEnrollmentStatus.COMPLETED },
        });
      } else {
        await prisma.campaignEnrollment.update({
          where: { id: enrollment.id },
          data: { currentNodeId: next.id, nextSendAt: new Date() },
        });
      }
      processed++;
      continue;
    }

    if (node.type === CampaignFlowNodeType.EXIT) {
      await logEvent(enrollment.id, node.id, "exit");
      await prisma.campaignEnrollment.update({
        where: { id: enrollment.id },
        data: { status: CampaignEnrollmentStatus.COMPLETED },
      });
      processed++;
      continue;
    }

    if (
      node.type === CampaignFlowNodeType.SEND_EMAIL ||
      node.type === CampaignFlowNodeType.SEND_SMS
    ) {
      const isSms = node.type === CampaignFlowNodeType.SEND_SMS;
      const cap = isSms ? settings.smsPerDay ?? 50 : settings.emailsPerDay ?? 50;
      if (sentToday >= cap) {
        // Push to tomorrow
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(8, 0, 0, 0);
        await prisma.campaignEnrollment.update({
          where: { id: enrollment.id },
          data: { nextSendAt: tomorrow },
        });
        continue;
      }

      const ok = await sendCampaignMessage({
        campaign: enrollment.campaign,
        customer: enrollment.customer,
        channel: isSms ? CampaignChannel.SMS : CampaignChannel.EMAIL,
        subject: String(node.config.subject ?? enrollment.campaign.subject ?? ""),
        bodyText: String(node.config.bodyText ?? ""),
        bodyHtml: (node.config.bodyHtml as string | undefined) ?? null,
      });

      await logEvent(enrollment.id, node.id, ok ? "sent" : "send_failed");

      const next = nextLinearNode(nodes, node.id);
      if (!next) {
        await prisma.campaignEnrollment.update({
          where: { id: enrollment.id },
          data: { status: CampaignEnrollmentStatus.COMPLETED },
        });
      } else {
        await prisma.campaignEnrollment.update({
          where: { id: enrollment.id },
          data: {
            currentNodeId: next.id,
            nextSendAt: new Date(),
          },
        });
      }
      processed++;
      continue;
    }

    if (node.type === CampaignFlowNodeType.BRANCH) {
      const waitHours = Number(node.config.waitHours ?? 48);
      const entered = await prisma.campaignEnrollmentEvent.findFirst({
        where: { enrollmentId: enrollment.id, nodeId: node.id, eventType: "branch_wait" },
        orderBy: { createdAt: "desc" },
      });

      if (!entered) {
        await logEvent(enrollment.id, node.id, "branch_wait");
        await prisma.campaignEnrollment.update({
          where: { id: enrollment.id },
          data: {
            nextSendAt: new Date(Date.now() + waitHours * 60 * 60 * 1000),
          },
        });
        processed++;
        continue;
      }

      const metric = String(node.config.metric ?? "opened");
      const recent = await prisma.campaignRecipient.findFirst({
        where: {
          campaignId: enrollment.campaignId,
          customerId: enrollment.customerId,
          status: { in: ["sent", "delivered"] },
        },
        orderBy: { sentAt: "desc" },
      });

      const yes =
        metric === "clicked"
          ? Boolean(recent?.clickedAt || (recent?.clickCount ?? 0) > 0)
          : Boolean(recent?.openedAt);

      const targetId = yes
        ? String(node.config.yesNextId ?? "")
        : String(node.config.noNextId ?? "");
      const target = findNode(nodes, targetId) ?? (yes ? nextLinearNode(nodes, node.id) : null);

      await logEvent(enrollment.id, node.id, yes ? "branch_yes" : "branch_no", {
        metric,
      });

      if (!target) {
        await prisma.campaignEnrollment.update({
          where: { id: enrollment.id },
          data: { status: CampaignEnrollmentStatus.COMPLETED },
        });
      } else {
        await prisma.campaignEnrollment.update({
          where: { id: enrollment.id },
          data: { currentNodeId: target.id, nextSendAt: new Date() },
        });
      }
      processed++;
    }
  }

  return { processed };
}

/** Enroll customers who match active trigger rules (job completed, city, form). */
export async function processCampaignTriggers(companyId?: string) {
  const campaigns = await prisma.campaign.findMany({
    where: {
      status: CampaignStatus.ACTIVE,
      type: CampaignType.DRIP,
      ...(companyId ? { companyId } : {}),
    },
    include: { flowNodes: { orderBy: { sortOrder: "asc" } } },
  });

  let enrolled = 0;

  for (const campaign of campaigns) {
    const trigger = campaign.flowNodes.find((n) => n.type === CampaignFlowNodeType.TRIGGER);
    if (!trigger) continue;
    const config = asConfig(trigger.config);
    const kind = String(config.kind ?? "manual_audience");
    if (kind === "manual_audience") continue;

    const entry =
      campaign.flowNodes.find((n) => n.type !== CampaignFlowNodeType.TRIGGER) ??
      campaign.flowNodes[0];
    if (!entry) continue;

    let customerIds: string[] = [];

    if (kind === "city") {
      const cities = (config.cities as string[] | undefined)?.filter(Boolean) ?? [];
      if (!cities.length) continue;
      const rows = await prisma.customer.findMany({
        where: {
          companyId: campaign.companyId,
          status: "ACTIVE",
          doNotService: false,
          marketingEmailOptOut: campaign.channel === "EMAIL" ? false : undefined,
          OR: [
            { city: { in: cities, mode: "insensitive" } },
            { properties: { some: { city: { in: cities, mode: "insensitive" } } } },
          ],
        },
        select: { id: true },
        take: 200,
      });
      customerIds = rows.map((r) => r.id);
    }

    if (kind === "job_completed") {
      const min = config.jobValueMin != null ? Number(config.jobValueMin) : null;
      const max = config.jobValueMax != null ? Number(config.jobValueMax) : null;
      const contains = String(config.lineItemContains ?? "").trim();
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const visits = await prisma.visit.findMany({
        where: {
          companyId: campaign.companyId,
          status: "COMPLETED",
          endAt: { gte: since },
          ...(contains
            ? { lineItems: { some: { name: { contains, mode: "insensitive" } } } }
            : {}),
        },
        select: {
          customerId: true,
          lineItems: { select: { total: true, quantity: true, unitPrice: true } },
        },
        take: 300,
      });
      for (const v of visits) {
        if (!v.customerId) continue;
        const total = v.lineItems.reduce((sum, li) => {
          if (li.total != null) return sum + Number(li.total);
          return sum + Number(li.unitPrice ?? 0) * Number(li.quantity ?? 1);
        }, 0);
        if (min != null && total < min) continue;
        if (max != null && total > max) continue;
        customerIds.push(v.customerId);
      }
    }

    if (kind === "form_no_booking") {
      const days = Number(config.formNoBookingDays ?? 7);
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const leads = await prisma.lead.findMany({
        where: {
          companyId: campaign.companyId,
          createdAt: { gte: since },
          convertedCustomerId: { not: null },
        },
        select: { convertedCustomerId: true, createdAt: true },
        take: 200,
      });
      for (const lead of leads) {
        if (!lead.convertedCustomerId) continue;
        const visit = await prisma.visit.findFirst({
          where: {
            customerId: lead.convertedCustomerId,
            createdAt: { gte: lead.createdAt },
          },
          select: { id: true },
        });
        if (!visit) customerIds.push(lead.convertedCustomerId);
      }
    }

    customerIds = [...new Set(customerIds)];
    for (const customerId of customerIds) {
      const existing = await prisma.campaignEnrollment.findUnique({
        where: { campaignId_customerId: { campaignId: campaign.id, customerId } },
      });
      if (existing) continue;
      await prisma.campaignEnrollment.create({
        data: {
          campaignId: campaign.id,
          customerId,
          currentNodeId: entry.id,
          nextSendAt: new Date(),
          status: CampaignEnrollmentStatus.ACTIVE,
        },
      });
      enrolled++;
    }
  }

  return { enrolled };
}

export async function getCampaignFlowMetrics(campaignId: string) {
  const [enrollments, events, nodes] = await Promise.all([
    prisma.campaignEnrollment.findMany({
      where: { campaignId },
      include: {
        customer: { select: { id: true, name: true, email: true } },
        events: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.campaignEnrollmentEvent.groupBy({
      by: ["nodeId", "eventType"],
      where: { enrollment: { campaignId } },
      _count: { _all: true },
    }),
    prisma.campaignFlowNode.findMany({
      where: { campaignId },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  const byStatus = {
    active: enrollments.filter((e) => e.status === "ACTIVE").length,
    completed: enrollments.filter((e) => e.status === "COMPLETED").length,
    cancelled: enrollments.filter((e) => e.status === "CANCELLED").length,
    paused: enrollments.filter((e) => e.status === "PAUSED").length,
    total: enrollments.length,
  };

  const nodeStats = nodes.map((node) => {
    const related = events.filter((e) => e.nodeId === node.id);
    return {
      nodeId: node.id,
      type: node.type,
      sortOrder: node.sortOrder,
      counts: Object.fromEntries(related.map((r) => [r.eventType, r._count._all])),
    };
  });

  return {
    byStatus,
    nodeStats,
    enrollments: enrollments.map((e) => ({
      id: e.id,
      status: e.status,
      currentNodeId: e.currentNodeId,
      nextSendAt: e.nextSendAt.toISOString(),
      customer: e.customer,
      lastEvent: e.events[0]
        ? {
            eventType: e.events[0].eventType,
            createdAt: e.events[0].createdAt.toISOString(),
          }
        : null,
    })),
  };
}
