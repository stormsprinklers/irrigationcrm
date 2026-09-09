import {
  CampaignChannel,
  CampaignEnrollmentStatus,
  CampaignFlowNodeType,
  CampaignStatus,
  CampaignType,
  EmailFolder,
  MessageDirection,
  Prisma,
} from "@prisma/client";
import {
  clampToCampaignSendWindow,
  isWithinCampaignSendWindow,
  nextLocalMorningAtHour,
} from "@/lib/communications/send-window";
import { prisma } from "@/lib/prisma";
import { queryAudienceCustomers } from "@/lib/marketing/audience";
import type { AudienceFilters, CampaignFlowNodeInput, DripSettings } from "@/lib/marketing/types";
import { sendCampaignMessage } from "@/lib/marketing/flow-send";
import {
  notifyAdminsCampaignQuietHours,
  scheduleOrHoldCampaignSend,
} from "@/lib/marketing/quiet-hours-notify";
import { mergeCustomerTags, parseAddTagConfig } from "@/lib/marketing/add-tag";
import { parseCampaignInstant } from "@/lib/marketing/campaign-time";
import { startOfZonedDay } from "@/lib/datetime/zoned";
import {
  matchingReplyKeyword,
  nextWaitCheckAt,
  parseBranchWaitMs,
  parseWaitConfig,
  recipientMatchesWaitAction,
  waitTimeoutAt,
  REPLY_POLL_MS,
  type WaitAction,
} from "@/lib/marketing/wait-config";
import {
  branchMatches,
  ifElseNeedsWait,
  ifElseTimeoutAt,
  ifElseWaitsForSmsReply,
  isLegacyReactionBranch,
  parseIfElseConfig,
  remapFlowNextIds,
  resolveIfElseBranch,
  type IfElseContact,
  type IfElseResolvePhase,
} from "@/lib/marketing/if-else";
import { loadIfElseContact } from "@/lib/marketing/if-else-contact";

type FlowNodeRow = {
  id: string;
  type: CampaignFlowNodeType;
  config: Record<string, unknown>;
  sortOrder: number;
};

function asConfig(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
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
        config: { mode: "delay", delayAmount: step.delayDays ?? 0, delayUnit: "days" },
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
  const idMap = new Map<string, string>();
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
    if (node.id) idMap.set(node.id, row.id);
    created.push(row);
  }

  const remapped = [];
  for (const row of created) {
    const config = remapFlowNextIds(asConfig(row.config), idMap);
    const needsUpdate = JSON.stringify(config) !== JSON.stringify(row.config);
    if (needsUpdate) {
      const updated = await prisma.campaignFlowNode.update({
        where: { id: row.id },
        data: { config: config as Prisma.InputJsonValue },
      });
      remapped.push(updated);
    } else {
      remapped.push(row);
    }
  }
  return remapped;
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

  const intendedStart = dripSettings.startAt
    ? parseCampaignInstant(dripSettings.startAt, campaign.company.timezone) ?? new Date()
    : new Date();
  const startAt = await scheduleOrHoldCampaignSend({
    companyId: campaign.companyId,
    campaignId,
    campaignName: campaign.name,
    timeZone: campaign.company.timezone,
    when: intendedStart,
  });
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

  return {
    enrolled: customers.length,
    deferredForQuietHours: startAt.getTime() > intendedStart.getTime() + 1000,
  };
}

function eventMeta(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function completeWaitAndAdvance(params: {
  enrollmentId: string;
  timezone: string | null;
  node: FlowNodeRow;
  nodes: FlowNodeRow[];
  reason: "timeout" | "reply" | "action";
  matched?: string | null;
}) {
  await logEvent(params.enrollmentId, params.node.id, "wait_completed", {
    reason: params.reason,
    matched: params.matched ?? null,
  });
  const next = nextLinearNode(params.nodes, params.node.id);
  if (!next) {
    await prisma.campaignEnrollment.update({
      where: { id: params.enrollmentId },
      data: { status: CampaignEnrollmentStatus.COMPLETED },
    });
    return;
  }
  const enrollment = await prisma.campaignEnrollment.findUnique({
    where: { id: params.enrollmentId },
    include: { campaign: { select: { id: true, name: true, companyId: true } } },
  });
  const nextSendAt = enrollment
    ? await scheduleOrHoldCampaignSend({
        companyId: enrollment.campaign.companyId,
        campaignId: enrollment.campaign.id,
        campaignName: enrollment.campaign.name,
        timeZone: params.timezone,
      })
    : clampToCampaignSendWindow(new Date(), params.timezone);
  await prisma.campaignEnrollment.update({
    where: { id: params.enrollmentId },
    data: {
      currentNodeId: next.id,
      nextSendAt,
    },
  });
}

function stubIfElseContact(smsReply: string): IfElseContact {
  return {
    name: "",
    city: "",
    companyName: "",
    tags: [],
    leadSource: "",
    ltv: 0,
    lastAppointmentAt: null,
    smsReply,
  };
}

function withSmsReply(contact: IfElseContact | null, smsReply: string | null): IfElseContact | null {
  if (smsReply == null) return contact;
  return contact ? { ...contact, smsReply } : stubIfElseContact(smsReply);
}

function nextIfElseCheckAt(until: Date | null, waitsForSms: boolean, from = new Date()) {
  if (!waitsForSms) return until ?? from;
  const poll = new Date(from.getTime() + REPLY_POLL_MS);
  if (until && until.getTime() <= poll.getTime()) return until;
  return poll;
}

async function latestInboundSmsBody(params: {
  companyId: string;
  customerId: string;
  since: Date;
}): Promise<string | null> {
  const message = await prisma.message.findFirst({
    where: {
      direction: MessageDirection.INBOUND,
      sentAt: { gte: params.since },
      conversation: {
        companyId: params.companyId,
        customerId: params.customerId,
      },
    },
    select: { body: true },
    orderBy: { sentAt: "desc" },
  });
  const body = message?.body?.trim();
  return body || null;
}

async function completeBranchAndAdvance(params: {
  enrollmentId: string;
  campaign: { id: string; name: string; companyId: string };
  timezone: string | null;
  node: FlowNodeRow;
  nodes: FlowNodeRow[];
  eventType: "branch_yes" | "branch_none" | "branch_timeout";
  targetId: string;
  meta?: Record<string, unknown>;
}) {
  await logEvent(params.enrollmentId, params.node.id, params.eventType, {
    nextId: params.targetId,
    ...params.meta,
  });
  const target = findNode(params.nodes, params.targetId);
  if (!target) {
    await prisma.campaignEnrollment.update({
      where: { id: params.enrollmentId },
      data: { status: CampaignEnrollmentStatus.COMPLETED },
    });
    return;
  }
  await prisma.campaignEnrollment.update({
    where: { id: params.enrollmentId },
    data: {
      currentNodeId: target.id,
      nextSendAt: await scheduleOrHoldCampaignSend({
        companyId: params.campaign.companyId,
        campaignId: params.campaign.id,
        campaignName: params.campaign.name,
        timeZone: params.timezone,
      }),
    },
  });
}

async function finishIfElseBranch(params: {
  enrollmentId: string;
  campaign: { id: string; name: string; companyId: string };
  timezone: string | null;
  node: FlowNodeRow;
  nodes: FlowNodeRow[];
  contact: IfElseContact | null;
  phase: IfElseResolvePhase;
}) {
  const parsed = parseIfElseConfig(params.node.config);
  const outcome = resolveIfElseBranch(params.contact, parsed, params.phase);
  await completeBranchAndAdvance({
    enrollmentId: params.enrollmentId,
    campaign: params.campaign,
    timezone: params.timezone,
    node: params.node,
    nodes: params.nodes,
    eventType:
      outcome.reason === "match"
        ? "branch_yes"
        : outcome.reason === "timeout"
          ? "branch_timeout"
          : "branch_none",
    targetId: outcome.nextId,
    meta: { branchId: outcome.branchId, reason: outcome.reason, phase: params.phase },
  });
}

async function customerReplyMatch(params: {
  companyId: string;
  customerId: string;
  since: Date;
  keywords: string[];
}): Promise<string | null> {
  const messages = await prisma.message.findMany({
    where: {
      direction: MessageDirection.INBOUND,
      sentAt: { gte: params.since },
      conversation: {
        companyId: params.companyId,
        customerId: params.customerId,
      },
    },
    select: { body: true },
    orderBy: { sentAt: "desc" },
    take: 40,
  });
  for (const message of messages) {
    const hit = matchingReplyKeyword(message.body, params.keywords);
    if (hit) return hit;
  }

  const emails = await prisma.emailMessage.findMany({
    where: {
      companyId: params.companyId,
      customerId: params.customerId,
      folder: EmailFolder.INBOX,
      createdAt: { gte: params.since },
    },
    select: { subject: true, bodyText: true },
    orderBy: { createdAt: "desc" },
    take: 40,
  });
  for (const email of emails) {
    const hit = matchingReplyKeyword(
      `${email.subject ?? ""}\n${email.bodyText ?? ""}`,
      params.keywords
    );
    if (hit) return hit;
  }
  return null;
}

async function customerActionMatch(params: {
  campaignId: string;
  customerId: string;
  action: WaitAction;
}): Promise<string | null> {
  const recent = await prisma.campaignRecipient.findFirst({
    where: {
      campaignId: params.campaignId,
      customerId: params.customerId,
      status: { in: ["sent", "delivered"] },
    },
    orderBy: { sentAt: "desc" },
  });
  if (!recipientMatchesWaitAction(recent, params.action)) return null;
  if (params.action === "clicked") return "clicked";
  if (params.action === "opened_or_clicked") {
    if (recent?.clickedAt || (recent?.clickCount ?? 0) > 0) return "clicked";
    return "opened";
  }
  return "opened";
}

export async function advanceWaitOnCustomerReply(params: {
  companyId: string;
  customerId: string;
  text: string;
  channel?: "sms" | "email";
}): Promise<{ advanced: number }> {
  const matchedPreview = matchingReplyKeyword(params.text, []);
  if (!matchedPreview) return { advanced: 0 };

  const enrollments = await prisma.campaignEnrollment.findMany({
    where: {
      customerId: params.customerId,
      status: CampaignEnrollmentStatus.ACTIVE,
      campaign: {
        companyId: params.companyId,
        status: CampaignStatus.ACTIVE,
        type: CampaignType.DRIP,
      },
    },
    include: {
      campaign: {
        include: {
          company: { select: { timezone: true } },
          flowNodes: { orderBy: { sortOrder: "asc" } },
        },
      },
    },
    take: 20,
  });

  let advanced = 0;
  for (const enrollment of enrollments) {
    const nodes = enrollment.campaign.flowNodes.map((n) => ({
      id: n.id,
      type: n.type,
      config: asConfig(n.config),
      sortOrder: n.sortOrder,
    }));
    const node = findNode(nodes, enrollment.currentNodeId);
    if (!node) continue;

    if (node.type === CampaignFlowNodeType.WAIT) {
      const wait = parseWaitConfig(node.config);
      if (!wait.usesReply) continue;

      const keywordHit = matchingReplyKeyword(params.text, wait.keywords);
      if (!keywordHit) continue;

      const waited = await prisma.campaignEnrollmentEvent.findFirst({
        where: { enrollmentId: enrollment.id, nodeId: node.id, eventType: "wait_started" },
        orderBy: { createdAt: "desc" },
      });
      if (!waited) continue;

      const alreadyDone = await prisma.campaignEnrollmentEvent.findFirst({
        where: {
          enrollmentId: enrollment.id,
          nodeId: node.id,
          eventType: "wait_completed",
          createdAt: { gte: waited.createdAt },
        },
      });
      if (alreadyDone) continue;

      await completeWaitAndAdvance({
        enrollmentId: enrollment.id,
        timezone: enrollment.campaign.company.timezone,
        node,
        nodes,
        reason: "reply",
        matched: keywordHit,
      });
      advanced += 1;
      continue;
    }

    if (node.type !== CampaignFlowNodeType.BRANCH) continue;
    if (params.channel === "email") continue;
    if (isLegacyReactionBranch(node.config)) continue;

    const parsed = parseIfElseConfig(node.config);
    if (!ifElseWaitsForSmsReply(parsed)) continue;

    const waited = await prisma.campaignEnrollmentEvent.findFirst({
      where: { enrollmentId: enrollment.id, nodeId: node.id, eventType: "branch_wait" },
      orderBy: { createdAt: "desc" },
    });
    if (!waited) continue;

    const alreadyDone = await prisma.campaignEnrollmentEvent.findFirst({
      where: {
        enrollmentId: enrollment.id,
        nodeId: node.id,
        eventType: { in: ["branch_yes", "branch_none", "branch_timeout"] },
        createdAt: { gte: waited.createdAt },
      },
    });
    if (alreadyDone) continue;

    const contact = await loadIfElseContact(params.companyId, params.customerId);
    await finishIfElseBranch({
      enrollmentId: enrollment.id,
      campaign: {
        id: enrollment.campaign.id,
        name: enrollment.campaign.name,
        companyId: enrollment.campaign.companyId,
      },
      timezone: enrollment.campaign.company.timezone,
      node,
      nodes,
      contact: withSmsReply(contact, params.text),
      phase: "reply",
    });
    advanced += 1;
  }

  return { advanced };
}

export async function advanceWaitOnTrackedAction(params: {
  campaignId: string;
  customerId: string;
  kind: "opened" | "clicked";
}): Promise<{ advanced: number }> {
  const enrollments = await prisma.campaignEnrollment.findMany({
    where: {
      customerId: params.customerId,
      campaignId: params.campaignId,
      status: CampaignEnrollmentStatus.ACTIVE,
      campaign: {
        status: CampaignStatus.ACTIVE,
        type: CampaignType.DRIP,
      },
    },
    include: {
      campaign: {
        include: {
          company: { select: { timezone: true } },
          flowNodes: { orderBy: { sortOrder: "asc" } },
        },
      },
    },
    take: 20,
  });

  let advanced = 0;
  for (const enrollment of enrollments) {
    const nodes = enrollment.campaign.flowNodes.map((n) => ({
      id: n.id,
      type: n.type,
      config: asConfig(n.config),
      sortOrder: n.sortOrder,
    }));
    const node = findNode(nodes, enrollment.currentNodeId);
    if (!node || node.type !== CampaignFlowNodeType.WAIT) continue;

    const wait = parseWaitConfig(node.config);
    if (!wait.usesAction) continue;
    if (wait.action === "opened" && params.kind !== "opened") continue;
    if (wait.action === "clicked" && params.kind !== "clicked") continue;

    const waited = await prisma.campaignEnrollmentEvent.findFirst({
      where: { enrollmentId: enrollment.id, nodeId: node.id, eventType: "wait_started" },
      orderBy: { createdAt: "desc" },
    });
    if (!waited) continue;

    const alreadyDone = await prisma.campaignEnrollmentEvent.findFirst({
      where: {
        enrollmentId: enrollment.id,
        nodeId: node.id,
        eventType: "wait_completed",
        createdAt: { gte: waited.createdAt },
      },
    });
    if (alreadyDone) continue;

    const hit = await customerActionMatch({
      campaignId: params.campaignId,
      customerId: params.customerId,
      action: wait.action,
    });
    if (!hit) continue;

    await completeWaitAndAdvance({
      enrollmentId: enrollment.id,
      timezone: enrollment.campaign.company.timezone,
      node,
      nodes,
      reason: "action",
      matched: hit,
    });
    advanced += 1;
  }

  return { advanced };
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
  const quietHoursNotified = new Set<string>();

  for (const enrollment of due) {
    const nodes = enrollment.campaign.flowNodes.map((n) => ({
      id: n.id,
      type: n.type,
      config: asConfig(n.config),
      sortOrder: n.sortOrder,
    }));
    if (nodes.length === 0) continue;

    const companyTz = enrollment.campaign.company.timezone;

    // Daily rate limits
    const settings = (enrollment.campaign.dripSettings ?? {}) as DripSettings;
    const startOfDay = startOfZonedDay(new Date(), companyTz);
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
      const wait = parseWaitConfig(node.config);
      const waited = await prisma.campaignEnrollmentEvent.findFirst({
        where: { enrollmentId: enrollment.id, nodeId: node.id, eventType: "wait_started" },
        orderBy: { createdAt: "desc" },
      });

      if (!waited) {
        const now = new Date();
        const until = waitTimeoutAt(wait, now, companyTz);
        const when = nextWaitCheckAt(wait, until, now);
        await logEvent(enrollment.id, node.id, "wait_started", {
          until: until?.toISOString() ?? null,
          mode: wait.mode,
          keywords: wait.keywords,
          action: wait.action,
        });
        await prisma.campaignEnrollment.update({
          where: { id: enrollment.id },
          data: { nextSendAt: when },
        });
        processed++;
        continue;
      }

      const alreadyDone = await prisma.campaignEnrollmentEvent.findFirst({
        where: {
          enrollmentId: enrollment.id,
          nodeId: node.id,
          eventType: "wait_completed",
          createdAt: { gte: waited.createdAt },
        },
      });
      if (alreadyDone) {
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
              nextSendAt: await scheduleOrHoldCampaignSend({
                companyId: enrollment.campaign.companyId,
                campaignId: enrollment.campaignId,
                campaignName: enrollment.campaign.name,
                timeZone: companyTz,
              }),
            },
          });
        }
        processed++;
        continue;
      }

      const meta = eventMeta(waited.meta);
      const until =
        typeof meta.until === "string" && meta.until
          ? new Date(meta.until)
          : waitTimeoutAt(wait, waited.createdAt, companyTz);
      const now = new Date();

      if (wait.usesReply) {
        const hit = await customerReplyMatch({
          companyId: enrollment.campaign.companyId,
          customerId: enrollment.customerId,
          since: waited.createdAt,
          keywords: wait.keywords,
        });
        if (hit) {
          await completeWaitAndAdvance({
            enrollmentId: enrollment.id,
            timezone: companyTz,
            node,
            nodes,
            reason: "reply",
            matched: hit,
          });
          processed++;
          continue;
        }
      }

      if (wait.usesAction) {
        const hit = await customerActionMatch({
          campaignId: enrollment.campaignId,
          customerId: enrollment.customerId,
          action: wait.action,
        });
        if (hit) {
          await completeWaitAndAdvance({
            enrollmentId: enrollment.id,
            timezone: companyTz,
            node,
            nodes,
            reason: "action",
            matched: hit,
          });
          processed++;
          continue;
        }
      }

      if (wait.hasTimeout && until && now.getTime() >= until.getTime()) {
        await completeWaitAndAdvance({
          enrollmentId: enrollment.id,
          timezone: companyTz,
          node,
          nodes,
          reason: "timeout",
        });
        processed++;
        continue;
      }

      await prisma.campaignEnrollment.update({
        where: { id: enrollment.id },
        data: { nextSendAt: nextWaitCheckAt(wait, until, now) },
      });
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
      if (!isWithinCampaignSendWindow(new Date(), companyTz)) {
        const now = new Date();
        const resumeAt = clampToCampaignSendWindow(now, companyTz);
        await prisma.campaignEnrollment.update({
          where: { id: enrollment.id },
          data: { nextSendAt: resumeAt },
        });
        if (!quietHoursNotified.has(enrollment.campaignId)) {
          quietHoursNotified.add(enrollment.campaignId);
          await notifyAdminsCampaignQuietHours({
            companyId: enrollment.campaign.companyId,
            campaignId: enrollment.campaignId,
            campaignName: enrollment.campaign.name,
            resumeAt,
            timeZone: companyTz,
          });
        }
        continue;
      }

      const isSms = node.type === CampaignFlowNodeType.SEND_SMS;
      const cap = isSms ? settings.smsPerDay ?? 50 : settings.emailsPerDay ?? 50;
      if (sentToday >= cap) {
        await prisma.campaignEnrollment.update({
          where: { id: enrollment.id },
          data: { nextSendAt: nextLocalMorningAtHour(new Date(), 8, companyTz) },
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
        flowNodeId: node.id,
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
            nextSendAt: await scheduleOrHoldCampaignSend({
                companyId: enrollment.campaign.companyId,
                campaignId: enrollment.campaignId,
                campaignName: enrollment.campaign.name,
                timeZone: companyTz,
              }),
          },
        });
      }
      processed++;
      continue;
    }

    if (node.type === CampaignFlowNodeType.ADD_TAG) {
      const tags = parseAddTagConfig(node.config);
      const customer = await prisma.customer.findFirst({
        where: { id: enrollment.customerId, companyId: enrollment.campaign.companyId },
        select: { id: true, tags: true },
      });
      if (customer && tags.length > 0) {
        const nextTags = mergeCustomerTags(customer.tags, tags);
        if (nextTags.length !== customer.tags.length) {
          await prisma.customer.update({
            where: { id: customer.id },
            data: { tags: nextTags },
          });
        }
      }

      await logEvent(enrollment.id, node.id, "tag_added", { tags });

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
            nextSendAt: await scheduleOrHoldCampaignSend({
                companyId: enrollment.campaign.companyId,
                campaignId: enrollment.campaignId,
                campaignName: enrollment.campaign.name,
                timeZone: companyTz,
              }),
          },
        });
      }
      processed++;
      continue;
    }

    if (node.type === CampaignFlowNodeType.BRANCH) {
      if (isLegacyReactionBranch(node.config)) {
        const entered = await prisma.campaignEnrollmentEvent.findFirst({
          where: { enrollmentId: enrollment.id, nodeId: node.id, eventType: "branch_wait" },
          orderBy: { createdAt: "desc" },
        });

        if (!entered) {
          await logEvent(enrollment.id, node.id, "branch_wait");
          await prisma.campaignEnrollment.update({
            where: { id: enrollment.id },
            data: {
              nextSendAt: new Date(Date.now() + parseBranchWaitMs(node.config)),
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
            data: {
              currentNodeId: target.id,
              nextSendAt: await scheduleOrHoldCampaignSend({
                companyId: enrollment.campaign.companyId,
                campaignId: enrollment.campaignId,
                campaignName: enrollment.campaign.name,
                timeZone: companyTz,
              }),
            },
          });
        }
        processed++;
        continue;
      }

      const parsed = parseIfElseConfig(node.config);
      const waitsForSms = ifElseWaitsForSmsReply(parsed);
      const needsWait = ifElseNeedsWait(parsed);
      const contact = await loadIfElseContact(
        enrollment.campaign.companyId,
        enrollment.customerId
      );

      const entered = await prisma.campaignEnrollmentEvent.findFirst({
        where: { enrollmentId: enrollment.id, nodeId: node.id, eventType: "branch_wait" },
        orderBy: { createdAt: "desc" },
      });

      const finish = (phase: IfElseResolvePhase, withContact: IfElseContact | null) =>
        finishIfElseBranch({
          enrollmentId: enrollment.id,
          campaign: {
            id: enrollment.campaign.id,
            name: enrollment.campaign.name,
            companyId: enrollment.campaign.companyId,
          },
          timezone: companyTz,
          node,
          nodes,
          contact: withContact,
          phase,
        });

      if (!entered) {
        const matchedImmediately = contact
          ? parsed.branches.some((branch) => branchMatches(contact, branch))
          : false;
        if (matchedImmediately || !needsWait) {
          await finish("immediate", contact);
          processed++;
          continue;
        }

        const now = new Date();
        const until = ifElseTimeoutAt(parsed, now, companyTz);
        await logEvent(enrollment.id, node.id, "branch_wait", {
          until: until?.toISOString() ?? null,
          waitsForSms,
          timeoutEnabled: parsed.timeoutEnabled,
        });
        await prisma.campaignEnrollment.update({
          where: { id: enrollment.id },
          data: { nextSendAt: nextIfElseCheckAt(until, waitsForSms, now) },
        });
        processed++;
        continue;
      }

      const alreadyDone = await prisma.campaignEnrollmentEvent.findFirst({
        where: {
          enrollmentId: enrollment.id,
          nodeId: node.id,
          eventType: { in: ["branch_yes", "branch_none", "branch_timeout"] },
          createdAt: { gte: entered.createdAt },
        },
      });
      if (alreadyDone) {
        const meta = eventMeta(alreadyDone.meta);
        const storedNextId = typeof meta.nextId === "string" ? meta.nextId : "";
        await completeBranchAndAdvance({
          enrollmentId: enrollment.id,
          campaign: {
            id: enrollment.campaign.id,
            name: enrollment.campaign.name,
            companyId: enrollment.campaign.companyId,
          },
          timezone: companyTz,
          node,
          nodes,
          eventType:
            alreadyDone.eventType === "branch_timeout"
              ? "branch_timeout"
              : alreadyDone.eventType === "branch_none"
                ? "branch_none"
                : "branch_yes",
          targetId: storedNextId,
          meta: { recovered: true, branchId: meta.branchId ?? "none" },
        });
        processed++;
        continue;
      }

      const waitMeta = eventMeta(entered.meta);
      const until =
        typeof waitMeta.until === "string" && waitMeta.until
          ? new Date(waitMeta.until)
          : ifElseTimeoutAt(parsed, entered.createdAt, companyTz);
      const now = new Date();

      if (waitsForSms) {
        const smsReply = await latestInboundSmsBody({
          companyId: enrollment.campaign.companyId,
          customerId: enrollment.customerId,
          since: entered.createdAt,
        });
        if (smsReply) {
          await finish("reply", withSmsReply(contact, smsReply));
          processed++;
          continue;
        }
      }

      const matchedWhileWaiting = contact
        ? parsed.branches.some((branch) => branchMatches(contact, branch))
        : false;
      if (matchedWhileWaiting) {
        await finish("immediate", contact);
        processed++;
        continue;
      }

      if (parsed.timeoutEnabled && until && now.getTime() >= until.getTime()) {
        await finish("timeout", contact);
        processed++;
        continue;
      }

      await prisma.campaignEnrollment.update({
        where: { id: enrollment.id },
        data: { nextSendAt: nextIfElseCheckAt(until, waitsForSms, now) },
      });
      processed++;
      continue;
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
    include: {
      flowNodes: { orderBy: { sortOrder: "asc" } },
      company: { select: { timezone: true } },
    },
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
          marketingSmsOptOut: campaign.channel === "SMS" ? false : undefined,
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
          nextSendAt: await scheduleOrHoldCampaignSend({
            companyId: campaign.companyId,
            campaignId: campaign.id,
            campaignName: campaign.name,
            timeZone: campaign.company.timezone,
          }),
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
      nextSendAt: e.nextSendAt ? e.nextSendAt.toISOString() : null,
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
