import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { GoogleAdsApiError, getGoogleAdsConnectionStatus, getGoogleAdsSummary } from "@/lib/google-ads/client";
import { buildAdsDashboard } from "@/lib/marketing/ads-dashboard";
import { MetaAdsApiError, getMetaAdsConnectionStatus, getMetaAdsSummary } from "@/lib/meta/ads";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const days = Number(request.nextUrl.searchParams.get("days") ?? 30);

    const [googleStatus, metaStatus] = await Promise.all([
      getGoogleAdsConnectionStatus(user.companyId),
      getMetaAdsConnectionStatus(user.companyId),
    ]);

    let googleSummary = null;
    let googleError: string | null = null;
    if (googleStatus?.customerId) {
      try {
        googleSummary = await getGoogleAdsSummary(user.companyId, days);
      } catch (error) {
        googleError = error instanceof Error ? error.message : "Failed to load Google Ads";
      }
    }

    let metaSummary = null;
    let metaError: string | null = null;
    if (metaStatus.connected) {
      try {
        metaSummary = await getMetaAdsSummary(user.companyId, days);
      } catch (error) {
        metaError = error instanceof Error ? error.message : "Failed to load Meta Ads";
      }
    }

    const dashboard = buildAdsDashboard({
      days,
      googleSummary,
      googleConnected: Boolean(googleStatus?.connected),
      googleReady: Boolean(googleStatus?.customerId),
      googleError,
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
