import {
  CallDisposition,
  CallDirection,
  EnrollmentStatus,
  EstimateStatus,
  InvoiceStatus,
  LeadStatus,
  PaymentMethod,
  VisitStatus,
} from "@prisma/client";
import {
  endOfMonth,
  format,
  startOfMonth,
  subMonths,
} from "date-fns";
import { prisma } from "@/lib/prisma";
import { sumDiscounts, sumLineItems, toNumber } from "@/lib/visits/totals";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export async function getInsightsReport(companyId: string) {
  const now = new Date();
  const mtdStart = startOfMonth(now);
  const ytdStart = new Date(now.getFullYear(), 0, 1);

  const [mtdPaid, ytdPaid, openEstimates, completedVisits, newCustomers, openInvoices] =
    await Promise.all([
      prisma.invoice.aggregate({
        where: { companyId, status: InvoiceStatus.PAID, paidAt: { gte: mtdStart } },
        _sum: { total: true },
      }),
      prisma.invoice.aggregate({
        where: { companyId, status: InvoiceStatus.PAID, paidAt: { gte: ytdStart } },
        _sum: { total: true },
      }),
      prisma.estimate.aggregate({
        where: { companyId, status: { in: [EstimateStatus.DRAFT, EstimateStatus.SENT] } },
        _sum: { total: true },
        _count: true,
      }),
      prisma.visit.count({
        where: { companyId, status: VisitStatus.COMPLETED, updatedAt: { gte: ytdStart } },
      }),
      prisma.customer.count({ where: { companyId, createdAt: { gte: ytdStart } } }),
      prisma.invoice.findMany({
        where: { companyId, status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIAL] } },
        include: { payments: true },
      }),
    ]);

  const allVisits = await prisma.visit.count({ where: { companyId, createdAt: { gte: ytdStart } } });
  const completionRate = allVisits > 0 ? Math.round((completedVisits / allVisits) * 100) : 0;

  const openBalance = openInvoices.reduce((s, inv) => {
    const paid = inv.payments.filter((p) => !p.refundedAt).reduce((sum, p) => sum + toNumber(p.amount), 0);
    return s + Math.max(0, toNumber(inv.total) - paid);
  }, 0);

  const totalInvoiced = await prisma.invoice.aggregate({
    where: { companyId, createdAt: { gte: ytdStart } },
    _sum: { total: true },
  });
  const collected = toNumber(ytdPaid._sum.total);
  const invoiced = toNumber(totalInvoiced._sum.total);
  const collectionRate = invoiced > 0 ? Math.round((collected / invoiced) * 100) : 0;

  return {
    cards: [
      { label: "Revenue MTD", value: formatCurrency(toNumber(mtdPaid._sum.total)) },
      { label: "Revenue YTD", value: formatCurrency(collected) },
      { label: "Open pipeline", value: formatCurrency(toNumber(openEstimates._sum.total)) },
      { label: "Completion rate", value: `${completionRate}%` },
      { label: "New customers YTD", value: String(newCustomers) },
      { label: "Collection rate", value: `${collectionRate}%` },
      { label: "Open AR", value: formatCurrency(openBalance) },
      { label: "Open estimates", value: String(openEstimates._count) },
    ],
  };
}

export async function getTechPerformanceReport(companyId: string) {
  const ytdStart = new Date(new Date().getFullYear(), 0, 1);
  const techs = await prisma.user.findMany({
    where: { companyId, role: "TECH", status: "ACTIVE" },
    select: { id: true, name: true },
  });

  const rows = await Promise.all(
    techs.map(async (tech) => {
      const visits = await prisma.visit.findMany({
        where: {
          companyId,
          assignedUserId: tech.id,
          status: VisitStatus.COMPLETED,
          updatedAt: { gte: ytdStart },
        },
        include: { lineItems: true, discounts: true, timeEvents: true },
      });

      let revenue = 0;
      for (const v of visits) {
        const sub = sumLineItems(v.lineItems);
        revenue += Math.max(0, sub - sumDiscounts(sub, v.discounts));
      }

      const hours = visits.reduce((sum, v) => {
        const events = v.timeEvents.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
        let workMs = 0;
        let start: Date | null = null;
        for (const e of events) {
          if (e.type === "START" || e.type === "RESUME") start = e.occurredAt;
          if ((e.type === "PAUSE" || e.type === "FINISH") && start) {
            workMs += e.occurredAt.getTime() - start.getTime();
            start = null;
          }
        }
        return sum + workMs / 3600000;
      }, 0);

      return {
        id: tech.id,
        name: tech.name,
        visitsCompleted: visits.length,
        revenue,
        revenueFormatted: formatCurrency(revenue),
        avgJobSize: visits.length > 0 ? formatCurrency(revenue / visits.length) : "$0.00",
        hours: Math.round(hours * 10) / 10,
      };
    })
  );

  return { rows: rows.sort((a, b) => b.revenue - a.revenue) };
}

export async function getFinancialReport(companyId: string) {
  const months: { month: string; revenue: number; payments: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = subMonths(new Date(), i);
    const start = startOfMonth(d);
    const end = endOfMonth(d);
    const [invoices, payments] = await Promise.all([
      prisma.invoice.aggregate({
        where: { companyId, createdAt: { gte: start, lte: end } },
        _sum: { total: true },
      }),
      prisma.payment.aggregate({
        where: {
          invoice: { companyId },
          paidAt: { gte: start, lte: end },
          refundedAt: null,
        },
        _sum: { amount: true },
      }),
    ]);
    months.push({
      month: format(d, "MMM yyyy"),
      revenue: toNumber(invoices._sum.total),
      payments: toNumber(payments._sum.amount),
    });
  }
  return { months };
}

export async function getCsrReport(companyId: string) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const calls = await prisma.callLog.findMany({
    where: { companyId, startedAt: { gte: thirtyDaysAgo } },
    select: {
      direction: true,
      startedAt: true,
      durationSec: true,
      disposition: true,
      handledByUserId: true,
      handledBy: { select: { name: true } },
    },
  });

  const byDay = new Map<string, { inbound: number; outbound: number }>();
  for (const call of calls) {
    const day = format(call.startedAt, "yyyy-MM-dd");
    const entry = byDay.get(day) ?? { inbound: 0, outbound: 0 };
    if (call.direction === CallDirection.INBOUND) entry.inbound++;
    else entry.outbound++;
    byDay.set(day, entry);
  }

  const daily = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({ date, ...counts }));

  const inbound = calls.filter((c) => c.direction === CallDirection.INBOUND).length;
  const outbound = calls.length - inbound;
  const avgDuration =
    calls.length > 0
      ? Math.round(calls.reduce((s, c) => s + (c.durationSec ?? 0), 0) / calls.length)
      : 0;

  const inboundCalls = calls.filter((c) => c.direction === CallDirection.INBOUND);
  const dispositioned = inboundCalls.filter((c) => c.disposition !== CallDisposition.NONE);
  const booked = inboundCalls.filter((c) => c.disposition === CallDisposition.BOOKED).length;
  const notBooked = inboundCalls.filter((c) => c.disposition === CallDisposition.NOT_BOOKED).length;
  const nonOpportunity = inboundCalls.filter(
    (c) => c.disposition === CallDisposition.NON_OPPORTUNITY
  ).length;

  const bookRate =
    dispositioned.length > 0 ? Math.round((booked / dispositioned.length) * 100) : 0;
  const nonOpportunityRate =
    dispositioned.length > 0 ? Math.round((nonOpportunity / dispositioned.length) * 100) : 0;

  const byAgentMap = new Map<string, { name: string; booked: number; total: number }>();
  for (const call of dispositioned) {
    const key = call.handledByUserId ?? "unknown";
    const name = call.handledBy?.name ?? "Unknown";
    const entry = byAgentMap.get(key) ?? { name, booked: 0, total: 0 };
    entry.total++;
    if (call.disposition === CallDisposition.BOOKED) entry.booked++;
    byAgentMap.set(key, entry);
  }

  const byAgent = [...byAgentMap.values()].map((a) => ({
    name: a.name,
    total: a.total,
    booked: a.booked,
    bookRate: a.total > 0 ? Math.round((a.booked / a.total) * 100) : 0,
  }));

  return {
    daily,
    inbound,
    outbound,
    totalCalls: calls.length,
    avgDurationSeconds: avgDuration,
    disposition: {
      booked,
      notBooked,
      nonOpportunity,
      none: inboundCalls.length - dispositioned.length,
      bookRate,
      nonOpportunityRate,
    },
    byAgent,
  };
}

export async function getEstimatesReport(companyId: string) {
  const estimates = await prisma.estimate.groupBy({
    by: ["status"],
    where: { companyId },
    _count: true,
    _sum: { total: true },
  });

  const sent = estimates.find((e) => e.status === EstimateStatus.SENT)?._count ?? 0;
  const approved =
    (estimates.find((e) => e.status === EstimateStatus.APPROVED)?._count ?? 0) +
    (estimates.find((e) => e.status === EstimateStatus.CONVERTED)?._count ?? 0);
  const conversionRate = sent > 0 ? Math.round((approved / sent) * 100) : 0;

  return {
    byStatus: estimates.map((e) => ({
      status: e.status,
      count: e._count,
      total: toNumber(e._sum.total),
      totalFormatted: formatCurrency(toNumber(e._sum.total)),
    })),
    conversionRate,
  };
}

export async function getLeadsReport(companyId: string) {
  const leads = await prisma.lead.findMany({
    where: { companyId },
    select: { status: true, source: true },
  });

  const byStatus = Object.values(LeadStatus).map((status) => ({
    status,
    count: leads.filter((l) => l.status === status).length,
  }));

  const sources = new Map<string, number>();
  for (const lead of leads) {
    const src = lead.source ?? "Unknown";
    sources.set(src, (sources.get(src) ?? 0) + 1);
  }

  return {
    byStatus,
    bySource: [...sources.entries()].map(([source, count]) => ({ source, count })),
    total: leads.length,
  };
}

export async function getVoiceReport(companyId: string) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const calls = await prisma.callLog.findMany({
    where: { companyId, startedAt: { gte: thirtyDaysAgo } },
    select: { durationSec: true, status: true },
  });

  const total = calls.length;
  const missed = calls.filter((c) => c.status === "no-answer" || c.status === "busy").length;
  const avgDuration =
    total > 0
      ? Math.round(calls.reduce((s, c) => s + (c.durationSec ?? 0), 0) / total)
      : 0;

  return { total, missed, avgDurationSeconds: avgDuration };
}

export async function getInvoicesReport(companyId: string) {
  const open = await prisma.invoice.findMany({
    where: { companyId, status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIAL] } },
    include: { payments: true },
  });

  const buckets = [
    { label: "0–30 days", min: 0, max: 30, total: 0, count: 0 },
    { label: "31–60 days", min: 31, max: 60, total: 0, count: 0 },
    { label: "61–90 days", min: 61, max: 90, total: 0, count: 0 },
    { label: "90+ days", min: 91, max: Infinity, total: 0, count: 0 },
  ];

  const now = Date.now();
  for (const inv of open) {
    const paid = inv.payments.filter((p) => !p.refundedAt).reduce((s, p) => s + toNumber(p.amount), 0);
    const balance = Math.max(0, toNumber(inv.total) - paid);
    const ageDays = Math.floor((now - inv.createdAt.getTime()) / 86400000);
    const bucket = buckets.find((b) => ageDays >= b.min && ageDays <= b.max);
    if (bucket) {
      bucket.total += balance;
      bucket.count++;
    }
  }

  return {
    buckets: buckets.map((b) => ({
      label: b.label,
      count: b.count,
      total: b.total,
      totalFormatted: formatCurrency(b.total),
    })),
  };
}

export async function getPaymentsReport(companyId: string) {
  const payments = await prisma.payment.findMany({
    where: { invoice: { companyId } },
    select: { method: true, amount: true, refundedAt: true },
  });

  const byMethod = Object.values(PaymentMethod).map((method) => {
    const filtered = payments.filter((p) => p.method === method && !p.refundedAt);
    return {
      method,
      count: filtered.length,
      total: filtered.reduce((s, p) => s + toNumber(p.amount), 0),
    };
  });

  const refundCount = payments.filter((p) => p.refundedAt).length;

  return {
    byMethod: byMethod.map((m) => ({
      ...m,
      totalFormatted: formatCurrency(m.total),
    })),
    refundCount,
  };
}

export async function getServicePlansChurn(companyId: string) {
  const periodStart = startOfMonth(new Date());
  const [activeStart, cancelled] = await Promise.all([
    prisma.maintenancePlanEnrollment.count({
      where: {
        companyId,
        status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.RENEWED] },
        startDate: { lt: periodStart },
      },
    }),
    prisma.maintenancePlanEnrollment.count({
      where: {
        companyId,
        status: EnrollmentStatus.CANCELLED,
        cancelledAt: { gte: periodStart },
      },
    }),
  ]);

  const churnRate = activeStart > 0 ? Math.round((cancelled / activeStart) * 1000) / 10 : 0;
  return { activeStart, cancelledThisMonth: cancelled, churnRatePercent: churnRate };
}

export const REPORT_LINKS = [
  { title: "Business insights", href: "/reporting/insights" },
  { title: "Tech performance", href: "/reporting/tech-performance" },
  { title: "Financial", href: "/reporting/financial" },
  { title: "CSR", href: "/reporting/csr" },
  { title: "Estimates", href: "/reporting/estimates" },
  { title: "Leads", href: "/reporting/leads" },
  { title: "Voice", href: "/reporting/voice" },
  { title: "Service plans", href: "/reporting/service-plans" },
  { title: "Invoices", href: "/reporting/invoices" },
  { title: "Payments", href: "/reporting/payments" },
  { title: "Custom", href: "/reporting/custom" },
];

export const JOBS_REPORT_CATEGORIES = [
  {
    title: "Overview",
    links: [
      { label: "Business insights", href: "/reporting/insights" },
      { label: "Tech performance", href: "/reporting/tech-performance" },
      { label: "Financial summary", href: "/reporting/financial" },
    ],
  },
  {
    title: "Operations",
    links: [
      { label: "Jobs report", href: "/reporting" },
      { label: "CSR metrics", href: "/reporting/csr" },
      { label: "Voice analytics", href: "/reporting/voice" },
    ],
  },
  {
    title: "Sales",
    links: [
      { label: "Estimates", href: "/reporting/estimates" },
      { label: "Leads", href: "/reporting/leads" },
    ],
  },
  {
    title: "Billing",
    links: [
      { label: "Invoices aging", href: "/reporting/invoices" },
      { label: "Payments", href: "/reporting/payments" },
      { label: "Service plans", href: "/reporting/service-plans" },
    ],
  },
];
