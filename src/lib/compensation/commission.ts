import type { CommissionBasis, TimeEventType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeItemUnitCost, loadItemForPricing } from "@/lib/price-book/pricing";
import { computeTotals, sumDiscounts, sumLineItems, toNumber } from "@/lib/visits/totals";
import { computeCommissionAmount } from "./rates";

type VisitForCommission = {
  id: string;
  assignedUserId: string | null;
  lineItems: Array<{
    quantity: unknown;
    unitPrice: unknown;
    unitCost: unknown;
    total: unknown;
    priceBookItemId: string | null;
  }>;
  discounts: Array<{ type: "PERCENT" | "FIXED"; amount: unknown }>;
  invoices?: Array<{
    payments: Array<{ amount: unknown; refundedAt: Date | null }>;
  }>;
};

export async function resolveLineItemUnitCost(
  lineItem: VisitForCommission["lineItems"][number]
) {
  if (lineItem.unitCost != null) return toNumber(lineItem.unitCost);
  if (!lineItem.priceBookItemId) return 0;
  const item = await loadItemForPricing(lineItem.priceBookItemId);
  if (!item) return 0;
  const cost = await computeItemUnitCost(item);
  return cost ?? 0;
}

export async function sumLineItemCosts(lineItems: VisitForCommission["lineItems"]) {
  let total = 0;
  for (const item of lineItems) {
    const unitCost = await resolveLineItemUnitCost(item);
    total += unitCost * toNumber(item.quantity);
  }
  return Math.round(total * 100) / 100;
}

export async function sumLaborOnlyCosts(lineItems: VisitForCommission["lineItems"]) {
  let total = 0;
  for (const item of lineItems) {
    if (!item.priceBookItemId) continue;
    const pbItem = await loadItemForPricing(item.priceBookItemId);
    if (!pbItem || pbItem.type !== "SERVICE") continue;
    const hours = pbItem.laborHours != null ? toNumber(pbItem.laborHours) : 0;
    if (hours <= 0) continue;
    const hourlyCost = pbItem.laborRatePreset
      ? toNumber(pbItem.laborRatePreset.hourlyCost)
      : pbItem.laborRate != null
        ? toNumber(pbItem.laborRate)
        : 0;
    total += hours * hourlyCost * toNumber(item.quantity);
  }
  return Math.round(total * 100) / 100;
}

export function visitRevenue(visit: VisitForCommission) {
  const subtotal = sumLineItems(visit.lineItems);
  const discountTotal = sumDiscounts(subtotal, visit.discounts);
  return computeTotals(subtotal, discountTotal).total;
}

export function collectedInvoiceAmount(
  invoices: VisitForCommission["invoices"] = []
) {
  return invoices.reduce((sum, inv) => {
    const paid = inv.payments
      .filter((p) => !p.refundedAt)
      .reduce((s, p) => s + toNumber(p.amount), 0);
    return sum + paid;
  }, 0);
}

export async function getCommissionBasisAmount(
  visit: VisitForCommission,
  basis: CommissionBasis
) {
  switch (basis) {
    case "COMPLETED_JOB_REVENUE":
      return visitRevenue(visit);
    case "COLLECTED_INVOICE":
      return collectedInvoiceAmount(visit.invoices);
    case "GROSS_PROFIT": {
      const revenue = visitRevenue(visit);
      const costs = await sumLineItemCosts(visit.lineItems);
      return Math.max(0, revenue - costs);
    }
    case "LABOR_ONLY":
      return await sumLaborOnlyCosts(visit.lineItems);
    default:
      return visitRevenue(visit);
  }
}

export async function computeVisitCommission(
  visit: VisitForCommission,
  basis: CommissionBasis,
  commissionPercent: number
) {
  const basisAmount = await getCommissionBasisAmount(visit, basis);
  return computeCommissionAmount(basisAmount, commissionPercent);
}

export function computeVisitWorkHours(
  timeEvents: Array<{ type: TimeEventType; occurredAt: Date; userId: string }>
) {
  const byUser = new Map<string, number>();

  const grouped = new Map<string, typeof timeEvents>();
  for (const event of timeEvents) {
    const list = grouped.get(event.userId) ?? [];
    list.push(event);
    grouped.set(event.userId, list);
  }

  for (const [userId, events] of grouped) {
    const sorted = [...events].sort(
      (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime()
    );
    let workMs = 0;
    let start: Date | null = null;
    for (const e of sorted) {
      if (e.type === "START" || e.type === "RESUME") start = e.occurredAt;
      if ((e.type === "PAUSE" || e.type === "FINISH") && start) {
        workMs += e.occurredAt.getTime() - start.getTime();
        start = null;
      }
    }
    byUser.set(userId, workMs / 3600000);
  }

  return byUser;
}

export async function loadCompanyCommissionSettings(companyId: string) {
  return prisma.company.findUniqueOrThrow({
    where: { id: companyId },
    select: {
      commissionBasis: true,
      payPeriodType: true,
      payPeriodAnchorDate: true,
    },
  });
}
