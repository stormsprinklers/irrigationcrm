import { prisma } from "@/lib/prisma";
import { isBillingPeriodLate } from "@/lib/maintenance-plans/late-payment";
import { computePeriodAmount } from "@/lib/maintenance-plans/billing";
import { serializePortalInvoice } from "@/lib/portal/serializers";
import { toNumber } from "@/lib/visits/totals";
import { listCustomerCardsOnFile } from "@/lib/customers/stripe";
import type { BillingFrequency } from "@prisma/client";

export type PortalUnpaidBillingPeriod = {
  id: string;
  enrollmentId: string;
  planName: string;
  propertyName: string;
  amount: number;
  dueDate: string;
  status: string;
  isLate: boolean;
};

export type PortalBillingSummary = {
  invoiceBalanceDue: number;
  maintenanceBalanceDue: number;
  totalBalanceDue: number;
  overdueTotal: number;
  payableInvoices: Array<{
    id: string;
    invoiceNumber: string;
    balanceDue: number;
    publicToken: string;
    createdAt: string;
  }>;
  unpaidMaintenancePeriods: PortalUnpaidBillingPeriod[];
  hasCardOnFile: boolean;
  card: { brand: string | null; last4: string | null } | null;
};

function isUnpaidMaintenanceStatus(status: string) {
  return status === "DUE" || status === "FAILED" || status === "PENDING";
}

export async function getPortalBillingSummary(params: {
  companyId: string;
  customerId: string;
}): Promise<PortalBillingSummary> {
  const [invoices, enrollments, cards] = await Promise.all([
    prisma.invoice.findMany({
      where: { companyId: params.companyId, customerId: params.customerId },
      include: { payments: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.maintenancePlanEnrollment.findMany({
      where: {
        companyId: params.companyId,
        customerId: params.customerId,
        status: { in: ["ACTIVE", "PENDING_RENEWAL", "EXPIRING_SOON"] },
      },
      include: {
        template: { select: { name: true } },
        property: { select: { name: true } },
        billingPeriods: {
          where: { status: { in: ["DUE", "FAILED", "PENDING"] } },
          orderBy: { dueDate: "asc" },
        },
      },
    }),
    listCustomerCardsOnFile({
      customerId: params.customerId,
      companyId: params.companyId,
    }),
  ]);

  const payableInvoices = invoices
    .map(serializePortalInvoice)
    .filter((inv) => inv.isPayable && inv.balanceDue > 0)
    .map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      balanceDue: inv.balanceDue,
      publicToken: inv.publicToken,
      createdAt: inv.createdAt,
    }));

  const unpaidMaintenancePeriods: PortalUnpaidBillingPeriod[] = [];
  for (const enrollment of enrollments) {
    for (const period of enrollment.billingPeriods) {
      if (!isUnpaidMaintenanceStatus(period.status)) continue;
      const amount = toNumber(period.amount);
      if (amount <= 0) continue;
      const late = isBillingPeriodLate({
        status: period.status,
        dueDate: period.dueDate,
        paidAt: period.paidAt,
      });
      // Include DUE/FAILED always; PENDING only when late.
      if (period.status === "PENDING" && !late) continue;
      unpaidMaintenancePeriods.push({
        id: period.id,
        enrollmentId: enrollment.id,
        planName: enrollment.template.name,
        propertyName: enrollment.property.name,
        amount,
        dueDate: period.dueDate.toISOString(),
        status: period.status,
        isLate: late,
      });
    }
  }

  const invoiceBalanceDue = payableInvoices.reduce((sum, inv) => sum + inv.balanceDue, 0);
  const maintenanceBalanceDue = unpaidMaintenancePeriods.reduce((sum, p) => sum + p.amount, 0);
  const overdueTotal =
    invoiceBalanceDue +
    unpaidMaintenancePeriods.filter((p) => p.isLate || p.status === "FAILED").reduce((s, p) => s + p.amount, 0);

  const card = cards.cards[0] ?? null;

  return {
    invoiceBalanceDue,
    maintenanceBalanceDue,
    totalBalanceDue: invoiceBalanceDue + maintenanceBalanceDue,
    overdueTotal,
    payableInvoices,
    unpaidMaintenancePeriods,
    hasCardOnFile: Boolean(card),
    card: card ? { brand: card.brand, last4: card.last4 } : null,
  };
}

export function frequencyOptionsForTemplate(params: {
  basePrice: number;
  allowedBillingFrequencies: BillingFrequency[];
  durationYears?: number | null;
}) {
  const allowed = params.allowedBillingFrequencies.filter(
    (f) => f === "MONTHLY" || f === "ANNUAL" || f === "QUARTERLY"
  );
  return allowed.map((frequency) => ({
    frequency,
    amount: computePeriodAmount(params.basePrice, frequency, params.durationYears),
    label:
      frequency === "MONTHLY"
        ? "Monthly"
        : frequency === "QUARTERLY"
          ? "Quarterly"
          : "Annually",
  }));
}
