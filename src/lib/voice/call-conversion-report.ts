import { CallAttributionMethod, CallDisposition } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type CrmCallConversionSummary = {
  inboundCalls: number;
  answeredCalls: number;
  bookedCalls: number;
  bookingRate: number | null;
  revenue: number;
  bySource: Array<{
    key: string;
    label: string;
    method: CallAttributionMethod;
    calls: number;
    booked: number;
    revenue: number;
  }>;
  lsaMatchedCalls: number;
  lsaBookedCalls: number;
  lsaRevenue: number;
};

function ratio(numerator: number, denominator: number) {
  if (!denominator) return null;
  return numerator / denominator;
}

export async function getCrmCallConversionSummary(
  companyId: string,
  startDate: string,
  endDate: string
): Promise<CrmCallConversionSummary> {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T23:59:59.999Z`);

  const conversions = await prisma.callConversion.findMany({
    where: {
      companyId,
      createdAt: { gte: start, lte: end },
    },
    select: {
      booked: true,
      answeredByUserId: true,
      attributionMethod: true,
      trackingSource: true,
      googleLsaLeadId: true,
      revenueAmount: true,
      disposition: true,
    },
  });

  const inboundCalls = conversions.length;
  const answeredCalls = conversions.filter((row) => row.answeredByUserId).length;
  const bookedCalls = conversions.filter((row) => row.booked).length;
  const revenue = conversions.reduce(
    (sum, row) => sum + (row.revenueAmount != null ? Number(row.revenueAmount) : 0),
    0
  );

  const sourceMap = new Map<
    string,
    {
      key: string;
      label: string;
      method: CallAttributionMethod;
      calls: number;
      booked: number;
      revenue: number;
    }
  >();

  for (const row of conversions) {
    const label =
      row.trackingSource?.trim() ||
      (row.attributionMethod === CallAttributionMethod.LSA_CALLER_MATCH
        ? "Google LSA"
        : row.attributionMethod === CallAttributionMethod.PRIMARY_NUMBER
          ? "Primary"
          : row.attributionMethod === CallAttributionMethod.DIALED_TRACKING_NUMBER
            ? "Tracking number"
            : "Unknown");
    const key = `${row.attributionMethod}:${label}`;
    const current = sourceMap.get(key) ?? {
      key,
      label,
      method: row.attributionMethod,
      calls: 0,
      booked: 0,
      revenue: 0,
    };
    current.calls += 1;
    if (row.booked || row.disposition === CallDisposition.BOOKED) current.booked += 1;
    current.revenue += row.revenueAmount != null ? Number(row.revenueAmount) : 0;
    sourceMap.set(key, current);
  }

  const lsaRows = conversions.filter(
    (row) =>
      row.attributionMethod === CallAttributionMethod.LSA_CALLER_MATCH ||
      Boolean(row.googleLsaLeadId) ||
      row.trackingSource?.toLowerCase().includes("lsa")
  );

  return {
    inboundCalls,
    answeredCalls,
    bookedCalls,
    bookingRate: ratio(bookedCalls, answeredCalls || inboundCalls),
    revenue,
    bySource: [...sourceMap.values()].sort((a, b) => b.booked - a.booked || b.calls - a.calls),
    lsaMatchedCalls: lsaRows.length,
    lsaBookedCalls: lsaRows.filter((row) => row.booked).length,
    lsaRevenue: lsaRows.reduce(
      (sum, row) => sum + (row.revenueAmount != null ? Number(row.revenueAmount) : 0),
      0
    ),
  };
}
