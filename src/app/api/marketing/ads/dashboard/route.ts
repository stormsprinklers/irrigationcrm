import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import {
  GoogleAdsApiError,
  getGoogleAdsConnectionStatus,
  getGoogleAdsSummary,
  getGoogleLsaSummary,
} from "@/lib/google-ads/client";
import { parseAdsDateRange } from "@/lib/marketing/ads-date-range";
import { buildAdsDashboard } from "@/lib/marketing/ads-dashboard";
import { MetaAdsApiError, getMetaAdsConnectionStatus, getMetaAdsSummary } from "@/lib/meta/ads";
import { getCrmCallConversionSummary } from "@/lib/voice/call-conversion-report";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const dateRange = parseAdsDateRange(request.nextUrl.searchParams);

    const [googleStatus, metaStatus, crmConversions] = await Promise.all([
      getGoogleAdsConnectionStatus(user.companyId),
      getMetaAdsConnectionStatus(user.companyId),
      getCrmCallConversionSummary(
        user.companyId,
        dateRange.startDate,
        dateRange.endDate
      ).catch(() => null),
    ]);

    let googleSummary = null;
    let googleError: string | null = null;
    let googleLsaSummary = null;
    let googleLsaError: string | null = null;

    if (googleStatus?.customerId) {
      const [ppcResult, lsaResult] = await Promise.allSettled([
        getGoogleAdsSummary(user.companyId, dateRange),
        getGoogleLsaSummary(user.companyId, dateRange),
      ]);

      if (ppcResult.status === "fulfilled") {
        googleSummary = ppcResult.value;
      } else {
        googleError =
          ppcResult.reason instanceof Error
            ? ppcResult.reason.message
            : "Failed to load Google Ads";
      }

      if (lsaResult.status === "fulfilled") {
        googleLsaSummary = lsaResult.value;
      } else {
        googleLsaError =
          lsaResult.reason instanceof Error
            ? lsaResult.reason.message
            : "Failed to load Google LSA";
      }
    }

    let metaSummary = null;
    let metaError: string | null = null;
    if (metaStatus.connected) {
      try {
        metaSummary = await getMetaAdsSummary(user.companyId, dateRange);
      } catch (error) {
        metaError = error instanceof Error ? error.message : "Failed to load Meta Ads";
      }
    }

    const dashboard = buildAdsDashboard({
      dateRange,
      googleSummary,
      googleConnected: Boolean(googleStatus?.connected),
      googleReady: Boolean(googleStatus?.customerId),
      googleError,
      googleLsaSummary,
      googleLsaError,
      googleLsaCrm: crmConversions
        ? {
            matchedCalls: crmConversions.lsaMatchedCalls,
            bookedCalls: crmConversions.lsaBookedCalls,
            revenue: crmConversions.lsaRevenue,
            bookingRate:
              crmConversions.lsaMatchedCalls > 0
                ? crmConversions.lsaBookedCalls / crmConversions.lsaMatchedCalls
                : null,
          }
        : null,
      metaSummary,
      metaConnected: Boolean(metaStatus.hasToken),
      metaReady: metaStatus.connected,
      metaError,
    });

    return NextResponse.json(dashboard);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    if (error instanceof GoogleAdsApiError || error instanceof MetaAdsApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to load ads dashboard";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
