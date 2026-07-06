import { NextResponse } from "next/server";
import { IntegrationType } from "@prisma/client";
import { authenticateIntegration, isIntegrationContext } from "@/lib/integrations/auth";
import { GoogleBusinessApiError, requireGbpCompany } from "@/lib/google-business/client";
import { getGbpPublicReviewStats } from "@/lib/google-business/public-review-stats";

export const dynamic = "force-dynamic";

/** GET /api/integrations/website/review-stats — public review count for website widget */
export async function GET(request: Request) {
  const auth = await authenticateIntegration(request, IntegrationType.WEBSITE);
  if (!isIntegrationContext(auth)) return auth;

  try {
    const company = await requireGbpCompany(auth.companyId);
    const stats = await getGbpPublicReviewStats(
      auth.companyId,
      company.googleBusinessAccountId!,
      company.googleBusinessLocationId!
    );

    if (!stats) {
      return NextResponse.json(
        { error: "Google review stats are not available yet" },
        { status: 503 }
      );
    }

    return NextResponse.json(stats, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    if (error instanceof GoogleBusinessApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to load review stats";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
