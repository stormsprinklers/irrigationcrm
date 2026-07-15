import { MarketingSpendChannel, Prisma } from "@prisma/client";
import { PAID_ATTRIBUTION_CHANNELS, attributionChannelLabel } from "@/lib/attribution";
import type { AdsDateRange } from "@/lib/marketing/ads-date-range";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/visits/totals";

export type AttributionKpis = {
  dateRange: {
    startDate: string;
    endDate: string;
    label: string;
    isAllTime: boolean;
  };
  totalAdSpend: number;
  leadsInRange: number;
  costPerLead: number | null;
  paidCostPerLead: number | null;
  invoiceRevenueInRange: number;
  paidAttributedRevenue: number;
  averageRoas: number | null;
  roasByChannel: Array<{
    channel: string;
    label: string;
    spend: number;
    revenue: number;
    roas: number | null;
  }>;
  adSpendPercentOfRevenue: number | null;
  /** True when spend came from live ad APIs because daily snapshots were empty. */
  spendFromLiveApis?: boolean;
};

async function fetchLivePaidSpendByChannel(
  companyId: string,
  range: AdsDateRange
): Promise<Map<string, number>> {
  const spend = new Map<string, number>();
  const [{ getGoogleAdsSummary, getGoogleLsaSummary }, { getMetaAdsSummary }] =
    await Promise.all([
      import("@/lib/google-ads/client"),
      import("@/lib/meta/ads"),
    ]);

  const results = await Promise.allSettled([
    getGoogleAdsSummary(companyId, range),
    getGoogleLsaSummary(companyId, range),
    getMetaAdsSummary(companyId, range),
  ]);

  if (results[0].status === "fulfilled") {
    spend.set(MarketingSpendChannel.google_ads, results[0].value.spend ?? 0);
  }
  if (results[1].status === "fulfilled") {
    spend.set(MarketingSpendChannel.google_lsa, results[1].value.spend ?? 0);
  }
  if (results[2].status === "fulfilled") {
    spend.set(MarketingSpendChannel.meta_ads, results[2].value.spend ?? 0);
  }

  return spend;
}

function utcStart(isoDate: string) {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

function utcEndExclusive(isoDate: string) {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

function ratio(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return numerator / denominator;
}

export async function getAttributionKpis(
  companyId: string,
  range: AdsDateRange
): Promise<AttributionKpis> {
  const start = utcStart(range.startDate);
  const endExclusive = utcEndExclusive(range.endDate);

  const [spendRows, leadsInRange, paidLeadsInRange, payments] = await Promise.all([
    prisma.marketingSpendDaily.findMany({
      where: {
        companyId,
        date: { gte: start, lt: endExclusive },
      },
      select: { channel: true, spend: true },
    }),
    prisma.lead.count({
      where: {
        companyId,
        status: { not: "SPAM" },
        OR: [
          { firstTouchAt: { gte: start, lt: endExclusive } },
          { AND: [{ firstTouchAt: null }, { createdAt: { gte: start, lt: endExclusive } }] },
        ],
      },
    }),
    prisma.lead.count({
      where: {
        companyId,
        status: { not: "SPAM" },
        attributionChannel: { in: [...PAID_ATTRIBUTION_CHANNELS] },
        OR: [
          { firstTouchAt: { gte: start, lt: endExclusive } },
          { AND: [{ firstTouchAt: null }, { createdAt: { gte: start, lt: endExclusive } }] },
        ],
      },
    }),
    prisma.payment.findMany({
      where: {
        refundedAt: null,
        paidAt: { gte: start, lt: endExclusive },
        invoice: { companyId, status: { not: "VOID" } },
      },
      select: {
        amount: true,
        invoice: {
          select: {
            customer: {
              select: { attributionChannel: true },
            },
          },
        },
      },
    }),
  ]);

  const spendByChannel = new Map<string, number>();
  let totalAdSpend = 0;
  for (const row of spendRows) {
    const spend = toNumber(row.spend);
    totalAdSpend += spend;
    spendByChannel.set(row.channel, (spendByChannel.get(row.channel) ?? 0) + spend);
  }

  // MarketingSpendDaily is filled by cron; until that has history, fall back to
  // the same live Google/Meta summaries the Ads page uses so overview KPIs match.
  let spendFromLiveApis = false;
  if (totalAdSpend <= 0) {
    const live = await fetchLivePaidSpendByChannel(companyId, range);
    for (const [channel, spend] of live) {
      if (spend > 0) {
        spendByChannel.set(channel, spend);
        totalAdSpend += spend;
        spendFromLiveApis = true;
      }
    }
  }

  let invoiceRevenueInRange = 0;
  let paidAttributedRevenue = 0;
  const revenueByPaidChannel = new Map<string, number>();

  for (const payment of payments) {
    const amount = toNumber(payment.amount);
    invoiceRevenueInRange += amount;
    const channel = payment.invoice.customer?.attributionChannel ?? null;
    if (channel && PAID_ATTRIBUTION_CHANNELS.includes(channel as (typeof PAID_ATTRIBUTION_CHANNELS)[number])) {
      paidAttributedRevenue += amount;
      revenueByPaidChannel.set(channel, (revenueByPaidChannel.get(channel) ?? 0) + amount);
    }
  }

  const paidChannels: MarketingSpendChannel[] = [
    MarketingSpendChannel.google_ads,
    MarketingSpendChannel.google_lsa,
    MarketingSpendChannel.meta_ads,
  ];

  const roasByChannel = paidChannels.map((channel) => {
    const spend = spendByChannel.get(channel) ?? 0;
    const revenue = revenueByPaidChannel.get(channel) ?? 0;
    return {
      channel,
      label: attributionChannelLabel(channel),
      spend,
      revenue,
      roas: ratio(revenue, spend),
    };
  });

  const paidSpend = paidChannels.reduce(
    (sum, channel) => sum + (spendByChannel.get(channel) ?? 0),
    0
  );

  // LSA-only advertisers: CRM Lead rows can lag Google's charged-lead volume
  // (and used to be further undercounted by Search pagination). Prefer the
  // larger Google LSA charged/lead count for CPL so it tracks Google's CPL.
  let leadsForCpl = leadsInRange;
  let paidLeadsForCpl = paidLeadsInRange;
  const lsaSpend = spendByChannel.get(MarketingSpendChannel.google_lsa) ?? 0;
  if (lsaSpend > 0) {
    try {
      const { getGoogleLsaSummary } = await import("@/lib/google-ads/client");
      const lsa = await getGoogleLsaSummary(companyId, range);
      const googleLeadCount = Math.max(lsa.chargedLeads, lsa.leads);
      if (googleLeadCount > leadsForCpl) leadsForCpl = googleLeadCount;
      if (googleLeadCount > paidLeadsForCpl) paidLeadsForCpl = googleLeadCount;
    } catch (err) {
      console.error("Attribution KPIs: LSA lead volume lookup failed", err);
    }
  }

  return {
    dateRange: {
      startDate: range.startDate,
      endDate: range.endDate,
      label: range.label,
      isAllTime: range.isAllTime,
    },
    totalAdSpend: Math.round(totalAdSpend * 100) / 100,
    leadsInRange: leadsForCpl,
    costPerLead: ratio(totalAdSpend, leadsForCpl),
    paidCostPerLead: ratio(paidSpend, paidLeadsForCpl),
    invoiceRevenueInRange: Math.round(invoiceRevenueInRange * 100) / 100,
    paidAttributedRevenue: Math.round(paidAttributedRevenue * 100) / 100,
    averageRoas: ratio(paidAttributedRevenue, paidSpend),
    roasByChannel,
    adSpendPercentOfRevenue: ratio(totalAdSpend, invoiceRevenueInRange),
    spendFromLiveApis,
  };
}

/** Average LTV among customers with lifetime paid revenue > 0. */
export async function getAveragePayingCustomerLtv(companyId: string): Promise<{
  avgLtv: number;
  payingCustomerCount: number;
}> {
  const payments = await prisma.payment.findMany({
    where: {
      refundedAt: null,
      invoice: { companyId, status: { not: "VOID" } },
    },
    select: {
      amount: true,
      invoice: { select: { customerId: true } },
    },
  });

  const byCustomer = new Map<string, number>();
  for (const payment of payments) {
    const customerId = payment.invoice.customerId;
    byCustomer.set(customerId, (byCustomer.get(customerId) ?? 0) + toNumber(payment.amount));
  }

  let total = 0;
  let count = 0;
  for (const ltv of byCustomer.values()) {
    if (ltv > 0) {
      total += ltv;
      count += 1;
    }
  }

  return {
    avgLtv: count > 0 ? Math.round((total / count) * 100) / 100 : 0,
    payingCustomerCount: count,
  };
}

export async function sumMarketingSpend(
  companyId: string,
  opts?: { start?: Date; end?: Date }
): Promise<number> {
  const where: Prisma.MarketingSpendDailyWhereInput = { companyId };
  if (opts?.start || opts?.end) {
    const dateFilter: Prisma.DateTimeFilter = {};
    if (opts.start) {
      dateFilter.gte = new Date(
        Date.UTC(opts.start.getFullYear(), opts.start.getMonth(), opts.start.getDate())
      );
    }
    if (opts.end) {
      dateFilter.lte = new Date(
        Date.UTC(opts.end.getFullYear(), opts.end.getMonth(), opts.end.getDate())
      );
    }
    where.date = dateFilter;
  }
  const agg = await prisma.marketingSpendDaily.aggregate({
    where,
    _sum: { spend: true },
  });
  return toNumber(agg._sum.spend);
}
