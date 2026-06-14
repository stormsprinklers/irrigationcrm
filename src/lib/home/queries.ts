import {
  EstimateStatus,
  InvoiceStatus,
  VisitStatus,
  type DiscountType,
} from "@prisma/client";
import { endOfDay, startOfDay, startOfMonth, startOfYear, subDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { sumDiscounts, sumLineItems, toNumber } from "@/lib/visits/totals";
import type { HomeDateRange, HomeKpi, HomeSummaryCard, HomeSummaryDTO } from "./types";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function getRangeBounds(range: HomeDateRange) {
  const now = new Date();
  const end = endOfDay(now);
  if (range === "mtd") return { start: startOfMonth(now), end };
  if (range === "last30") return { start: startOfDay(subDays(now, 30)), end };
  return { start: startOfYear(now), end };
}

async function visitTotal(visit: {
  lineItems: { quantity: unknown; unitPrice: unknown; total: unknown }[];
  discounts: { type: DiscountType; amount: unknown }[];
}) {
  const subtotal = sumLineItems(visit.lineItems);
  const discountTotal = sumDiscounts(subtotal, visit.discounts);
  return Math.max(0, subtotal - discountTotal);
}

export async function getHomeSummary(
  companyId: string,
  dateRange: HomeDateRange = "ytd"
): Promise<Omit<HomeSummaryDTO, "greeting">> {
  const { start, end } = getRangeBounds(dateRange);

  const [openEstimates, unscheduledVisits, openInvoices, completedVisits, newCustomers, paidInvoices] =
    await Promise.all([
      prisma.estimate.findMany({
        where: { companyId, status: { in: [EstimateStatus.DRAFT, EstimateStatus.SENT] } },
        select: { total: true },
      }),
      prisma.visit.findMany({
        where: { companyId, status: VisitStatus.UNSCHEDULED },
        include: { lineItems: true, discounts: true },
      }),
      prisma.invoice.findMany({
        where: { companyId, status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIAL] } },
        include: { payments: true },
      }),
      prisma.visit.findMany({
        where: {
          companyId,
          status: VisitStatus.COMPLETED,
          updatedAt: { gte: start, lte: end },
        },
        include: { lineItems: true, discounts: true },
      }),
      prisma.customer.count({
        where: { companyId, createdAt: { gte: start, lte: end } },
      }),
      prisma.invoice.findMany({
        where: {
          companyId,
          status: { in: [InvoiceStatus.PAID, InvoiceStatus.PARTIAL] },
          paidAt: { gte: start, lte: end },
        },
        select: { total: true },
      }),
    ]);

  const estimatesTotal = openEstimates.reduce((s, e) => s + toNumber(e.total), 0);
  const unscheduledTotal = (
    await Promise.all(unscheduledVisits.map((v) => visitTotal(v)))
  ).reduce((s, t) => s + t, 0);
  const openInvoiceBalance = openInvoices.reduce((s, inv) => {
    const paid = inv.payments
      .filter((p) => !p.refundedAt)
      .reduce((sum, p) => sum + toNumber(p.amount), 0);
    return s + Math.max(0, toNumber(inv.total) - paid);
  }, 0);

  let jobRevenueFixed = 0;
  for (const v of completedVisits) {
    jobRevenueFixed += await visitTotal(v);
  }

  const invoiceRevenue = paidInvoices.reduce((s, i) => s + toNumber(i.total), 0);
  const totalRevenue = jobRevenueFixed + invoiceRevenue;
  const jobsCompleted = completedVisits.length;
  const avgJobSize = jobsCompleted > 0 ? totalRevenue / jobsCompleted : 0;

  const bookedVisits = await prisma.visit.count({
    where: { companyId, createdAt: { gte: start, lte: end } },
  });

  const cards: HomeSummaryCard[] = [
    {
      title: "Estimates",
      highlight: {
        label: `${openEstimates.length} Open estimate${openEstimates.length === 1 ? "" : "s"}`,
        value: formatCurrency(estimatesTotal),
      },
      linkLabel: "View all estimates",
      href: "/customers/estimates",
    },
    {
      title: "Jobs",
      highlight: {
        label: `${unscheduledVisits.length} Unscheduled job${unscheduledVisits.length === 1 ? "" : "s"}`,
        value: formatCurrency(unscheduledTotal),
      },
      linkLabel: "View all jobs",
      href: "/customers/jobs",
    },
    {
      title: "Invoices",
      highlight: {
        label: `${openInvoices.length} Open invoice${openInvoices.length === 1 ? "" : "s"}`,
        value: formatCurrency(openInvoiceBalance),
      },
      linkLabel: "View all invoices",
      href: "/customers/invoices",
    },
  ];

  const kpis: HomeKpi[] = [
    { label: "Job Revenue Earned", value: formatCurrency(totalRevenue), change: "—" },
    { label: "Jobs Completed", value: String(jobsCompleted), change: "—" },
    { label: "Average Job Size", value: formatCurrency(avgJobSize), change: "—" },
    { label: "Total New Jobs Booked", value: String(bookedVisits), change: "—" },
    { label: "New Customers", value: String(newCustomers), change: "—" },
  ];

  return { cards, kpis, dateRange };
}
