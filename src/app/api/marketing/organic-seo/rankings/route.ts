import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getSerpRankings } from "@/lib/local-seo/serp-rankings-service";
import { normalizeWebsiteHost } from "@/lib/serpapi/parse-organic-results";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const keyword = request.nextUrl.searchParams.get("keyword")?.trim();
    const refresh = request.nextUrl.searchParams.get("refresh") === "1";
    const mock = request.nextUrl.searchParams.get("mock") === "1";

    const [company, keywords, cities] = await Promise.all([
      prisma.company.findUnique({
        where: { id: user.companyId },
        select: {
          organicSearchWebsiteUrl: true,
          website: true,
        },
      }),
      prisma.localSeoKeyword.findMany({
        where: { companyId: user.companyId, channel: "ORGANIC" },
        orderBy: [{ sortOrder: "asc" }, { keyword: "asc" }],
        select: { keyword: true },
      }),
      prisma.localSeoTargetCity.findMany({
        where: { companyId: user.companyId },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          canonicalName: true,
          latitude: true,
          longitude: true,
        },
      }),
    ]);

    if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const selectedKeyword = keyword || keywords[0]?.keyword;
    if (!selectedKeyword) {
      return badRequestResponse("Add at least one organic keyword in Settings → Search rankings");
    }
    if (cities.length === 0) {
      return badRequestResponse("Add at least one target location in Settings → Search rankings");
    }

    const websiteUrl = company.organicSearchWebsiteUrl ?? company.website;
    if (!websiteUrl?.trim()) {
      return badRequestResponse("Set your website URL in Settings → Search rankings");
    }

    const trackedName = normalizeWebsiteHost(websiteUrl) || websiteUrl;
    const data = await getSerpRankings({
      companyId: user.companyId,
      channel: "ORGANIC",
      keyword: selectedKeyword,
      trackedName,
      websiteUrl,
      cities,
      refresh,
      forceMock: mock,
    });

    if (refresh && data.quota?.citiesSkipped) {
      return NextResponse.json(data, { status: 207 });
    }

    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message = error instanceof Error ? error.message : "Failed to load rankings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
