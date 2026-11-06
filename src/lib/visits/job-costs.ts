import { TechTimeCategory } from "@prisma/client";
import { effectiveHourlyCost } from "@/lib/compensation/rates";
import { computeVisitWorkHours } from "@/lib/compensation/commission";
import { prisma } from "@/lib/prisma";

export type VisitContractorCostItem = {
  id: string;
  name: string;
  quantity: number;
  unitCost: number;
  total: number;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function parseVisitContractorCostItems(raw: unknown): VisitContractorCostItem[] {
  const metadata = record(raw);
  const source = Array.isArray(metadata?.jobCostItems)
    ? metadata.jobCostItems
    : Array.isArray(metadata?.contractorCostItems)
      ? metadata.contractorCostItems
      : [];
  return source.slice(0, 100).flatMap((rawItem, index) => {
    const item = record(rawItem);
    if (!item) return [];
    const name = typeof item.name === "string" ? item.name.trim().slice(0, 160) : "";
    const quantity = Number(item.quantity);
    const unitCost = Number(item.unitCost);
    if (!name || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitCost) || unitCost < 0) return [];
    return [{
      id: typeof item.id === "string" && item.id.trim() ? item.id.trim().slice(0, 120) : `cost-${index + 1}`,
      name,
      quantity: Math.round(Math.min(quantity, 100000) * 1000) / 1000,
      unitCost: Math.round(Math.min(unitCost, 9_999_999) * 100) / 100,
      total: Math.round(quantity * unitCost * 100) / 100,
    }];
  });
}

export async function loadVisitJobCosts(companyId: string, visitId: string, now = new Date()) {
  const visit = await prisma.visit.findFirst({
    where: { id: visitId, companyId },
    select: {
      id: true,
      designExportMetadata: true,
      techTimeSegments: {
        where: { category: TechTimeCategory.WORKING },
        orderBy: { startedAt: "asc" },
        include: { user: { select: { id: true, name: true, payType: true, hourlyRate: true, commissionPercent: true, annualSalary: true } } },
      },
      timeEvents: { orderBy: { occurredAt: "asc" } },
    },
  });
  if (!visit) return null;

  const metadata = record(visit.designExportMetadata);
  const materialCostsConfigured = Array.isArray(metadata?.jobCostItems) || Array.isArray(metadata?.contractorCostItems);
  const items = parseVisitContractorCostItems(visit.designExportMetadata);
  const materialCost = Math.round(items.reduce((sum, item) => sum + item.total, 0) * 100) / 100;
  const hoursByUser = new Map<string, { name: string; hours: number; hourlyRate: number | null }>();

  for (const segment of visit.techTimeSegments) {
    const endedAt = segment.endedAt ?? now;
    const hours = Math.max(0, endedAt.getTime() - segment.startedAt.getTime()) / 3_600_000;
    const current = hoursByUser.get(segment.userId) ?? {
      name: segment.user.name,
      hours: 0,
      hourlyRate: effectiveHourlyCost(segment.user),
    };
    current.hours += hours;
    hoursByUser.set(segment.userId, current);
  }

  const fallbackHours = computeVisitWorkHours(visit.timeEvents);
  const fallbackUserIds = [...fallbackHours.keys()].filter((userId) => !hoursByUser.has(userId));
  if (fallbackUserIds.length) {
    const users = await prisma.user.findMany({
      where: { companyId, id: { in: fallbackUserIds } },
      select: { id: true, name: true, payType: true, hourlyRate: true, commissionPercent: true, annualSalary: true },
    });
    for (const user of users) {
      hoursByUser.set(user.id, {
        name: user.name,
        hours: fallbackHours.get(user.id) ?? 0,
        hourlyRate: effectiveHourlyCost(user),
      });
    }
  }

  const labor = [...hoursByUser.entries()].map(([userId, entry]) => {
    const hours = Math.round(entry.hours * 100) / 100;
    const cost = entry.hourlyRate == null ? null : Math.round(hours * entry.hourlyRate * 100) / 100;
    return { userId, name: entry.name, hours, hourlyRate: entry.hourlyRate, cost };
  });
  const laborCost = Math.round(labor.reduce((sum, entry) => sum + (entry.cost ?? 0), 0) * 100) / 100;
  return { items, materialCostsConfigured, materialCost, labor, laborCost, totalCost: Math.round((materialCost + laborCost) * 100) / 100 };
}

export async function saveVisitJobCostItems(params: {
  companyId: string;
  visitId: string;
  userId: string;
  items: VisitContractorCostItem[];
}) {
  const visit = await prisma.visit.findFirst({
    where: { id: params.visitId, companyId: params.companyId },
    select: { designExportMetadata: true },
  });
  if (!visit) return null;
  const metadata = record(visit.designExportMetadata) ?? {};
  const items = parseVisitContractorCostItems({ jobCostItems: params.items });
  await prisma.visit.update({
    where: { id: params.visitId },
    data: {
      designExportMetadata: {
        ...metadata,
        jobCostItems: items,
        jobCostItemsUpdatedAt: new Date().toISOString(),
        jobCostItemsUpdatedBy: params.userId,
      },
    },
  });
  return items;
}
