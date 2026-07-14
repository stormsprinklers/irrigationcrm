import { MarketingSpendChannel, Prisma } from "@prisma/client";
import { getGoogleAdsSummary, getGoogleLsaSummary } from "@/lib/google-ads/client";
import { getMetaAdsSummary } from "@/lib/meta/ads";
import type { AdsDateRange } from "@/lib/marketing/ads-date-range";
import { prisma } from "@/lib/prisma";

const DEFAULT_BACKFILL_DAYS = 90;

function utcDateOnly(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dayRange(isoDate: string): AdsDateRange {
  return {
    startDate: isoDate,
    endDate: isoDate,
    label: isoDate,
    presetDays: null,
    isAllTime: false,
  };
}

async function upsertSpendRow(input: {
  companyId: string;
  date: string;
  channel: MarketingSpendChannel;
  spend: number;
  impressions?: number;
  clicks?: number;
}) {
  await prisma.marketingSpendDaily.upsert({
    where: {
      companyId_date_channel: {
        companyId: input.companyId,
        date: utcDateOnly(input.date),
        channel: input.channel,
      },
    },
    create: {
      companyId: input.companyId,
      date: utcDateOnly(input.date),
      channel: input.channel,
      spend: new Prisma.Decimal(Math.round(input.spend * 100) / 100),
      impressions: input.impressions ?? null,
      clicks: input.clicks ?? null,
    },
    update: {
      spend: new Prisma.Decimal(Math.round(input.spend * 100) / 100),
      impressions: input.impressions ?? null,
      clicks: input.clicks ?? null,
    },
  });
}

async function syncCompanyDay(companyId: string, isoDate: string) {
  const range = dayRange(isoDate);
  const errors: string[] = [];
  let upserts = 0;

  try {
    const google = await getGoogleAdsSummary(companyId, range);
    await upsertSpendRow({
      companyId,
      date: isoDate,
      channel: MarketingSpendChannel.google_ads,
      spend: google.spend,
      impressions: google.impressions,
      clicks: google.clicks,
    });
    upserts += 1;
  } catch (err) {
    errors.push(`google_ads: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const lsa = await getGoogleLsaSummary(companyId, range);
    await upsertSpendRow({
      companyId,
      date: isoDate,
      channel: MarketingSpendChannel.google_lsa,
      spend: lsa.spend,
      impressions: lsa.impressions,
      clicks: lsa.clicks,
    });
    upserts += 1;
  } catch (err) {
    errors.push(`google_lsa: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const meta = await getMetaAdsSummary(companyId, range);
    await upsertSpendRow({
      companyId,
      date: isoDate,
      channel: MarketingSpendChannel.meta_ads,
      spend: meta.spend,
      impressions: meta.impressions,
      clicks: meta.clicks,
    });
    upserts += 1;
  } catch (err) {
    errors.push(`meta_ads: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { upserts, errors };
}

/**
 * Sync MarketingSpendDaily for yesterday + optional backfill on empty history.
 */
export async function syncMarketingSpendDaily(options?: {
  backfillDays?: number;
  companyId?: string;
}) {
  const backfillDays = options?.backfillDays ?? DEFAULT_BACKFILL_DAYS;
  const companies = await prisma.company.findMany({
    where: options?.companyId ? { id: options.companyId } : undefined,
    select: {
      id: true,
      googleAdsRefreshToken: true,
      googleAdsCustomerId: true,
      metaAdsAccessToken: true,
      metaAdAccountId: true,
    },
  });

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayIso = formatUtcDate(yesterday);

  const results: Array<{
    companyId: string;
    daysSynced: string[];
    upserts: number;
    errors: string[];
  }> = [];

  for (const company of companies) {
    const hasGoogle = Boolean(company.googleAdsRefreshToken && company.googleAdsCustomerId);
    const hasMeta = Boolean(company.metaAdsAccessToken && company.metaAdAccountId);
    if (!hasGoogle && !hasMeta) continue;

    const existingCount = await prisma.marketingSpendDaily.count({
      where: { companyId: company.id },
    });

    const dates: string[] = [yesterdayIso];
    if (existingCount === 0 && backfillDays > 1) {
      for (let i = 2; i <= backfillDays; i++) {
        const d = new Date(today);
        d.setUTCDate(d.getUTCDate() - i);
        dates.push(formatUtcDate(d));
      }
    }

    let upserts = 0;
    const errors: string[] = [];
    for (const isoDate of dates) {
      const day = await syncCompanyDay(company.id, isoDate);
      upserts += day.upserts;
      errors.push(...day.errors.map((e) => `${isoDate} ${e}`));
    }

    results.push({
      companyId: company.id,
      daysSynced: dates,
      upserts,
      errors,
    });
  }

  return {
    ok: true as const,
    yesterday: yesterdayIso,
    companies: results.length,
    results,
  };
}
