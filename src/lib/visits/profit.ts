import { prisma } from "@/lib/prisma";
import {
  computeVisitCommission,
  computeVisitWorkHours,
  loadCompanyCommissionSettings,
  sumLineItemCosts,
} from "@/lib/compensation/commission";
import {
  effectiveHourlyCost,
  usesCommissionPay,
} from "@/lib/compensation/rates";
import { computeTotals, sumDiscounts, sumLineItems, toNumber } from "@/lib/visits/totals";

export type VisitProfitBreakdownLine = {
  label: string;
  amount: number;
};

export type VisitProfit = {
  revenue: number;
  lineItemCost: number;
  actualLaborCost: number;
  estimatedCommission: number;
  grossProfit: number;
  netProfit: number;
  marginPercent: number;
  breakdown: VisitProfitBreakdownLine[];
  notes: string[];
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export async function computeVisitProfit(companyId: string, visitId: string): Promise<VisitProfit | null> {
  const visit = await prisma.visit.findFirst({
    where: { id: visitId, companyId },
    include: {
      lineItems: true,
      discounts: true,
      timeEvents: { include: { user: { select: { id: true, name: true } } } },
      assignedUser: {
        select: {
          id: true,
          name: true,
          payType: true,
          hourlyRate: true,
          commissionPercent: true,
          annualSalary: true,
        },
      },
      invoices: { include: { payments: true } },
    },
  });

  if (!visit) return null;

  const company = await loadCompanyCommissionSettings(companyId);
  const subtotal = sumLineItems(visit.lineItems);
  const discountTotal = sumDiscounts(subtotal, visit.discounts);
  const revenue = computeTotals(subtotal, discountTotal).total;
  const lineItemCost = await sumLineItemCosts(visit.lineItems);

  const hoursByUser = computeVisitWorkHours(visit.timeEvents);
  const userIds = [...hoursByUser.keys()];
  const users =
    userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds }, companyId },
          select: {
            id: true,
            name: true,
            payType: true,
            hourlyRate: true,
            commissionPercent: true,
            annualSalary: true,
          },
        })
      : [];

  const userMap = new Map(users.map((u) => [u.id, u]));
  let actualLaborCost = 0;
  const laborBreakdown: VisitProfitBreakdownLine[] = [];

  for (const [userId, hours] of hoursByUser) {
    const user = userMap.get(userId);
    if (!user) continue;
    const rate = effectiveHourlyCost(user);
    if (rate == null || hours <= 0) continue;
    const cost = Math.round(hours * rate * 100) / 100;
    actualLaborCost += cost;
    laborBreakdown.push({
      label: `${user.name} (${hours.toFixed(2)}h × ${formatCurrency(rate)}/hr)`,
      amount: cost,
    });
  }
  actualLaborCost = Math.round(actualLaborCost * 100) / 100;

  let estimatedCommission = 0;
  if (
    visit.assignedUser &&
    usesCommissionPay(visit.assignedUser.payType) &&
    visit.assignedUser.commissionPercent != null
  ) {
    estimatedCommission = await computeVisitCommission(
      visit,
      company.commissionBasis,
      toNumber(visit.assignedUser.commissionPercent)
    );
  }

  const grossProfit = Math.round((revenue - lineItemCost) * 100) / 100;
  const netProfit = Math.round(
    (grossProfit - actualLaborCost - estimatedCommission) * 100
  ) / 100;
  const marginPercent = revenue > 0 ? Math.round((netProfit / revenue) * 1000) / 10 : 0;

  const notes: string[] = [];
  const hasBundledLabor = visit.lineItems.some((li) => li.priceBookItemId != null);
  if (hasBundledLabor && actualLaborCost > 0) {
    notes.push(
      "Service line items may include bundled labor in material COGS; actual visit hours are shown separately."
    );
  }

  const breakdown: VisitProfitBreakdownLine[] = [
    { label: "Revenue", amount: revenue },
    { label: "Line item costs", amount: -lineItemCost },
    ...laborBreakdown.map((l) => ({ label: l.label, amount: -l.amount })),
  ];

  if (estimatedCommission > 0) {
    breakdown.push({
      label: `Est. commission (${visit.assignedUser?.name ?? "assigned tech"})`,
      amount: -estimatedCommission,
    });
  }

  return {
    revenue,
    lineItemCost,
    actualLaborCost,
    estimatedCommission,
    grossProfit,
    netProfit,
    marginPercent,
    breakdown,
    notes,
  };
}
