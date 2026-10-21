import { LeadStatus, Prisma, SalesPipelineStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const STAGE_RANK: Record<SalesPipelineStage, number> = {
  LEAD: 0,
  QUALIFIED: 1,
  CONVERTED: 2,
  SOLD: 3,
  DISQUALIFIED: -1,
};

type PipelineSnapshot = {
  pipelineStage: SalesPipelineStage | null;
  pipelineLeadAt: Date | null;
  pipelineQualifiedAt: Date | null;
  pipelineConvertedAt: Date | null;
  pipelineSoldAt: Date | null;
  pipelineDisqualifiedAt: Date | null;
  pipelineLeadSource: string | null;
  pipelineFirstContactedAt: Date | null;
  pipelineLeadId: string | null;
};

type AdvanceInput = {
  companyId: string;
  customerId: string;
  stage: Exclude<SalesPipelineStage, "DISQUALIFIED">;
  occurredAt?: Date;
  leadSource?: string | null;
  firstContactedAt?: Date | null;
  leadId?: string | null;
};

function stagesAllowedBefore(target: AdvanceInput["stage"]): Array<SalesPipelineStage> {
  return (Object.keys(STAGE_RANK) as SalesPipelineStage[]).filter(
    (stage) =>
      (stage !== "DISQUALIFIED" && STAGE_RANK[stage] < STAGE_RANK[target]) ||
      (stage === "DISQUALIFIED" && target !== "LEAD")
  );
}

export function pipelineAdvanceData(
  current: PipelineSnapshot,
  target: AdvanceInput["stage"],
  occurredAt: Date,
  details: Pick<AdvanceInput, "leadSource" | "firstContactedAt" | "leadId"> = {}
): Prisma.CustomerUpdateManyMutationInput | null {
  if (current.pipelineStage === "SOLD") return null;
  if (current.pipelineStage === "DISQUALIFIED" && target === "LEAD") return null;
  if (current.pipelineStage && STAGE_RANK[current.pipelineStage] >= STAGE_RANK[target]) return null;

  const reachesQualified = STAGE_RANK[target] >= STAGE_RANK.QUALIFIED;
  const reachesConverted = STAGE_RANK[target] >= STAGE_RANK.CONVERTED;
  const reachesSold = STAGE_RANK[target] >= STAGE_RANK.SOLD;

  return {
    pipelineStage: target,
    pipelineLeadAt: current.pipelineLeadAt ?? occurredAt,
    pipelineQualifiedAt: reachesQualified
      ? current.pipelineQualifiedAt ?? occurredAt
      : current.pipelineQualifiedAt,
    pipelineConvertedAt: reachesConverted
      ? current.pipelineConvertedAt ?? occurredAt
      : current.pipelineConvertedAt,
    pipelineSoldAt: reachesSold ? current.pipelineSoldAt ?? occurredAt : current.pipelineSoldAt,
    pipelineLeadSource:
      current.pipelineLeadSource ?? (details.leadSource?.trim() || null),
    pipelineFirstContactedAt:
      current.pipelineFirstContactedAt ?? details.firstContactedAt ?? null,
    pipelineLeadId: current.pipelineLeadId ?? details.leadId ?? null,
  };
}

export async function advanceCustomerPipeline(input: AdvanceInput) {
  const current = await prisma.customer.findFirst({
    where: { id: input.customerId, companyId: input.companyId },
    select: {
      pipelineStage: true,
      pipelineLeadAt: true,
      pipelineQualifiedAt: true,
      pipelineConvertedAt: true,
      pipelineSoldAt: true,
      pipelineDisqualifiedAt: true,
      pipelineLeadSource: true,
      pipelineFirstContactedAt: true,
      pipelineLeadId: true,
    },
  });
  if (!current) return false;

  const data = pipelineAdvanceData(current, input.stage, input.occurredAt ?? new Date(), input);
  if (!data) return false;

  const allowed = stagesAllowedBefore(input.stage);
  const result = await prisma.customer.updateMany({
    where: {
      id: input.customerId,
      companyId: input.companyId,
      OR: [{ pipelineStage: null }, { pipelineStage: { in: allowed } }],
    },
    data,
  });
  return result.count > 0;
}

export async function addCustomerToPipelineFromLead(params: {
  companyId: string;
  customerId: string;
  lead: {
    id: string;
    status: LeadStatus;
    source: string | null;
    createdAt: Date;
    contactedAt: Date | null;
  };
}) {
  return advanceCustomerPipeline({
    companyId: params.companyId,
    customerId: params.customerId,
    stage: params.lead.status === LeadStatus.QUALIFIED ? "QUALIFIED" : "LEAD",
    occurredAt: params.lead.createdAt,
    leadSource: params.lead.source,
    firstContactedAt: params.lead.contactedAt,
    leadId: params.lead.id,
  });
}

export async function recordCustomerPipelineContact(params: {
  companyId: string;
  customerId: string;
  contactedAt?: Date;
}) {
  const result = await prisma.customer.updateMany({
    where: {
      id: params.customerId,
      companyId: params.companyId,
      pipelineLeadAt: { not: null },
      pipelineFirstContactedAt: null,
      pipelineDisqualifiedAt: null,
    },
    data: { pipelineFirstContactedAt: params.contactedAt ?? new Date() },
  });
  return result.count > 0;
}

export async function disqualifyCustomerPipelineForSmsSpam(params: {
  companyId: string;
  customerId: string;
  occurredAt?: Date;
}) {
  const at = params.occurredAt ?? new Date();
  const current = await prisma.customer.findFirst({
    where: { id: params.customerId, companyId: params.companyId },
    select: { pipelineLeadAt: true, pipelineLeadSource: true },
  });
  if (!current) return false;
  const result = await prisma.customer.updateMany({
    where: {
      id: params.customerId,
      companyId: params.companyId,
      pipelineQualifiedAt: null,
      pipelineConvertedAt: null,
      pipelineSoldAt: null,
      OR: [{ pipelineStage: null }, { pipelineStage: "LEAD" }],
    },
    data: {
      pipelineStage: "DISQUALIFIED",
      pipelineLeadAt: current.pipelineLeadAt ?? at,
      pipelineDisqualifiedAt: at,
      pipelineLeadSource: current.pipelineLeadSource ?? "SMS",
    },
  });
  return result.count > 0;
}

export async function restoreCustomerPipelineFromSmsSpam(params: {
  companyId: string;
  customerId: string;
}) {
  const result = await prisma.customer.updateMany({
    where: {
      id: params.customerId,
      companyId: params.companyId,
      pipelineStage: "DISQUALIFIED",
      pipelineDisqualifiedAt: { not: null },
      pipelineQualifiedAt: null,
      pipelineConvertedAt: null,
      pipelineSoldAt: null,
    },
    data: {
      pipelineStage: "LEAD",
      pipelineDisqualifiedAt: null,
    },
  });
  return result.count > 0;
}

export function pipelineSpeedSeconds(input: {
  pipelineLeadAt: Date | string | null;
  pipelineFirstContactedAt: Date | string | null;
}) {
  if (!input.pipelineLeadAt || !input.pipelineFirstContactedAt) return null;
  const leadAt = new Date(input.pipelineLeadAt).getTime();
  const contactedAt = new Date(input.pipelineFirstContactedAt).getTime();
  if (!Number.isFinite(leadAt) || !Number.isFinite(contactedAt) || contactedAt < leadAt) return null;
  return Math.round((contactedAt - leadAt) / 1000);
}
