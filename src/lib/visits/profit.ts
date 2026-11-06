import { prisma } from "@/lib/prisma";
import {
  computeVisitCommission,
  loadCompanyCommissionSettings,
  sumLineItemCosts,
} from "@/lib/compensation/commission";
import { usesCommissionPay } from "@/lib/compensation/rates";
import { computeTotals, sumDiscounts, sumLineItems, toNumber } from "@/lib/visits/totals";
import { loadVisitJobCosts } from "@/lib/visits/job-costs";

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
  const jobCosts = await loadVisitJobCosts(companyId, visitId);
  const fallbackLineItemCost = await sumLineItemCosts(visit.lineItems);
  const lineItemCost = jobCosts?.materialCostsConfigured ? jobCosts.materialCost : fallbackLineItemCost;
  const actualLaborCost = jobCosts?.laborCost ?? 0;
  const laborBreakdown: VisitProfitBreakdownLine[] = (jobCosts?.labor ?? []).flatMap((entry) =>
    entry.cost != null && entry.hours > 0 && entry.hourlyRate != null
      ? [{
          label: `${entry.name} (${entry.hours.toFixed(2)}h × ${formatCurrency(entry.hourlyRate)}/hr)`,
          amount: entry.cost,
        }]
      : []
  );

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
  const hasBundledLabor = !jobCosts?.materialCostsConfigured && visit.lineItems.some((li) => li.priceBookItemId != null);
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
