import { LeadStatus, VisitStatus } from "@prisma/client";
import { format } from "date-fns";
import {
  ATTRIBUTION_CHANNELS,
  attributionChannelLabel,
  isPaidChannel,
} from "@/lib/attribution";
import { visitRevenue } from "@/lib/compensation/commission";
import { getAttributionKpis } from "@/lib/marketing/attribution-kpis";
import type { AdsDateRange } from "@/lib/marketing/ads-date-range";
import type { ReportRangeInput } from "@/lib/reporting/date-range";
import { resolveReportRange } from "@/lib/reporting/date-range";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/visits/totals";

function adsRangeFromReport(rangeInput: ReportRangeInput): AdsDateRange {
  const resolved = resolveReportRange(rangeInput);
  const isAllTime = rangeInput.preset === "overall";
  return {
    startDate: format(resolved.start, "yyyy-MM-dd"),
    endDate: format(resolved.end, "yyyy-MM-dd"),
    label: resolved.label,
    presetDays: rangeInput.preset === "last30" ? 30 : null,
    isAllTime,
  };
}

function ratio(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return numerator / denominator;
}

function money(value: number | null) {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

function channelKey(value: string | null | undefined) {
  if (!value) return "unknown";
  return ATTRIBUTION_CHANNELS.includes(value as (typeof ATTRIBUTION_CHANNELS)[number])
    ? value
    : "unknown";
}

function normalizeChannelFilter(raw?: string) {
  const s = raw?.trim().toLowerCase() ?? "";
  if (!s) return null;
  if (s.includes("lsa") || s.includes("local service")) return "google_lsa";
  if (s.includes("meta") || s.includes("facebook") || s.includes("instagram")) return "meta_ads";
  if (s.includes("google ads") || s === "google" || s === "google_ads" || s.includes("ppc")) {
    return "google_ads";
  }
  if (s.includes("organic") || s.includes("seo")) return "organic";
  if (s.includes("direct")) return "direct";
  if (s.includes("referral")) return "referral";
  if (s.includes("gbp") || s.includes("business profile") || s.includes("gmb")) return "gbp";
  if (s.includes("other")) return "other_paid";
  return channelKey(s.replace(/\s+/g, "_"));
}

type Bucket = {
  channel: string;
  leads: number;
  platformLeads: number;
  convertedLeads: number;
  bookedLeads: number;
  newCustomers: number;
  completedVisits: number;
  visitRevenue: number;
  invoiceRevenue: number;
  spend: number;
};

function emptyBucket(channel: string): Bucket {
  return {
    channel,
    leads: 0,
    platformLeads: 0,
    convertedLeads: 0,
    bookedLeads: 0,
    newCustomers: 0,
    completedVisits: 0,
    visitRevenue: 0,
    invoiceRevenue: 0,
    spend: 0,
  };
}

export async function getMarketingChannelMetrics(
  companyId: string,
  rangeInput: ReportRangeInput,
  channelFilter?: string
) {
  const adsRange = adsRangeFromReport(rangeInput);
  const start = new Date(`${adsRange.startDate}T00:00:00.000Z`);
  const endExclusive = new Date(`${adsRange.endDate}T00:00:00.000Z`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

  const inRange = {
    gte: start,
    lt: endExclusive,
  };

  const [attribution, leads, customers, visits, payments] = await Promise.all([
    getAttributionKpis(companyId, adsRange),
    prisma.lead.findMany({
      where: {
        companyId,
        status: { not: LeadStatus.SPAM },
        OR: [
          { firstTouchAt: inRange },
          { AND: [{ firstTouchAt: null }, { createdAt: inRange }] },
        ],
      },
      select: {
        id: true,
        status: true,
        attributionChannel: true,
        convertedCustomerId: true,
      },
    }),
    prisma.customer.findMany({
      where: { companyId, createdAt: inRange },
      select: { id: true, attributionChannel: true },
    }),
    prisma.visit.findMany({
      where: {
        companyId,
        status: VisitStatus.COMPLETED,
        updatedAt: inRange,
      },
      include: {
        lineItems: true,
        discounts: true,
        customer: { select: { attributionChannel: true } },
      },
    }),
    prisma.payment.findMany({
      where: {
        refundedAt: null,
        paidAt: inRange,
        invoice: { companyId, status: { not: "VOID" } },
      },
      select: {
        amount: true,
        invoice: { select: { customer: { select: { attributionChannel: true } } } },
      },
    }),
  ]);

  const buckets = new Map<string, Bucket>();
  function bucket(channel: string | null | undefined) {
    const key = channelKey(channel);
    const existing = buckets.get(key);
    if (existing) return existing;
    const created = emptyBucket(key);
    buckets.set(key, created);
    return created;
  }

  for (const channel of ATTRIBUTION_CHANNELS) bucket(channel);

  const convertedCustomerIds = new Set<string>();
  for (const lead of leads) {
    const row = bucket(lead.attributionChannel);
    row.leads += 1;
    if (lead.status === LeadStatus.WON || lead.convertedCustomerId) {
      row.convertedLeads += 1;
      if (lead.convertedCustomerId) convertedCustomerIds.add(lead.convertedCustomerId);
    }
  }

  if (convertedCustomerIds.size > 0) {
    const booked = await prisma.visit.findMany({
      where: {
        companyId,
        customerId: { in: [...convertedCustomerIds] },
        status: { not: VisitStatus.CANCELLED },
      },
      select: { customerId: true },
      distinct: ["customerId"],
    });
    const bookedIds = new Set(booked.map((v) => v.customerId).filter(Boolean));
    for (const lead of leads) {
      if (lead.convertedCustomerId && bookedIds.has(lead.convertedCustomerId)) {
        bucket(lead.attributionChannel).bookedLeads += 1;
      }
    }
  }

  for (const customer of customers) {
    bucket(customer.attributionChannel).newCustomers += 1;
  }

  for (const visit of visits) {
    const row = bucket(visit.customer?.attributionChannel ?? null);
    row.completedVisits += 1;
    row.visitRevenue += visitRevenue(visit);
  }

  for (const payment of payments) {
    const amount = toNumber(payment.amount);
    bucket(payment.invoice.customer?.attributionChannel ?? null).invoiceRevenue += amount;
  }

  for (const row of attribution.roasByChannel) {
    bucket(row.channel).spend += row.spend;
  }

  bucket("google_ads").platformLeads = attribution.platformLeadVolume.google_ads;
  bucket("google_lsa").platformLeads = attribution.platformLeadVolume.google_lsa;
  bucket("meta_ads").platformLeads = attribution.platformLeadVolume.meta_ads;

  const wanted = normalizeChannelFilter(channelFilter);

  const channels = [...buckets.values()]
    .filter((row) => {
      if (wanted && row.channel !== wanted) return false;
      return (
        row.leads > 0 ||
        row.newCustomers > 0 ||
        row.completedVisits > 0 ||
        row.spend > 0 ||
        row.invoiceRevenue > 0
      );
    })
    .map((row) => {
      const paid = isPaidChannel(row.channel);
      const cpl = paid ? ratio(row.spend, row.platformLeads) : null;
      const cac = paid ? ratio(row.spend, row.newCustomers) : null;
      return {
        channel: row.channel,
        label: attributionChannelLabel(row.channel),
        crmLeads: row.leads,
        adPlatformLeads: paid ? row.platformLeads : null,
        convertedLeads: row.convertedLeads,
        crmConversionRate: ratio(row.convertedLeads, row.leads),
        bookedLeads: row.bookedLeads,
        bookingRate: ratio(row.bookedLeads, row.leads),
        newCustomers: row.newCustomers,
        adSpend: paid ? money(row.spend) : 0,
        costPerLead: paid ? money(cpl) : null,
        cac: paid ? money(cac) : null,
        completedVisits: row.completedVisits,
        averageTicket: money(ratio(row.visitRevenue, row.completedVisits)),
        visitRevenue: money(row.visitRevenue),
        invoiceRevenue: money(row.invoiceRevenue),
        roas: paid ? ratio(row.invoiceRevenue, row.spend) : null,
      };
    })
    .sort((a, b) => (b.adSpend ?? 0) - (a.adSpend ?? 0) || b.crmLeads - a.crmLeads);

  const totals = channels.reduce(
    (acc, row) => {
      acc.leads += row.crmLeads;
      acc.convertedLeads += row.convertedLeads;
      acc.bookedLeads += row.bookedLeads;
      acc.newCustomers += row.newCustomers;
      acc.adSpend += row.adSpend ?? 0;
      acc.completedVisits += row.completedVisits;
      acc.visitRevenue += row.visitRevenue ?? 0;
      acc.invoiceRevenue += row.invoiceRevenue ?? 0;
      return acc;
    },
    {
      leads: 0,
      convertedLeads: 0,
      bookedLeads: 0,
      newCustomers: 0,
      adSpend: 0,
      completedVisits: 0,
      visitRevenue: 0,
      invoiceRevenue: 0,
    }
  );

  return {
    range: attribution.dateRange,
    company: {
      adSpend: attribution.totalAdSpend,
      crmLeads: attribution.leadsInRange,
      paidPlatformConversions: attribution.paidPlatformConversions,
      costPerLead: money(attribution.costPerLead),
      paidCostPerLead: money(attribution.paidCostPerLead),
      cac: money(ratio(attribution.totalAdSpend, totals.newCustomers)),
      conversionRate: ratio(totals.convertedLeads, totals.leads),
      bookingRate: ratio(totals.bookedLeads, totals.leads),
      averageTicket: money(ratio(totals.visitRevenue, totals.completedVisits)),
      invoiceRevenue: attribution.invoiceRevenueInRange,
      averageRoas: attribution.averageRoas,
      adSpendPercentOfRevenue: attribution.adSpendPercentOfRevenue,
    },
    channels,
    definitions: {
      costPerLead:
        "Paid channels only: ad spend ÷ ad-platform conversions (Google Ads conversions, LSA charged leads, Meta conversions). Unpaid channels (organic, referral, GBP, direct) have no CPL.",
      cac: "Ad spend ÷ new customers created in range with that first-touch channel. Paid channels only.",
      crmLeads: "CRM first-touch leads attributed to the channel. Not the Google Ads conversion count.",
      adPlatformLeads: "Google/Meta conversion or LSA lead count used for CPL.",
      conversionRate: "CRM won/converted leads ÷ CRM leads. This is office/field, not Google Ads conversion rate.",
      bookingRate: "Converted leads that have a scheduled (non-cancelled) visit ÷ CRM leads.",
      averageTicket: "Completed-job visit revenue ÷ completed visits in range.",
      adSpend: "Paid channels only (Google Ads, LSA, Meta).",
    },
  };
}
