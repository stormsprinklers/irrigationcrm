import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getSerpRankings } from "@/lib/local-seo/serp-rankings-service";
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
          name: true,
          googleBusinessLocationTitle: true,
        },
      }),
      prisma.localSeoKeyword.findMany({
        where: { companyId: user.companyId, channel: "GBP" },
        orderBy: [{ sortOrder: "asc" }, { keyword: "asc" }],
        select: { keyword: true },
      }),
      prisma.localSeoTargetCity.findMany({
        where: { companyId: user.companyId },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          serpApiId: true,
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
      return badRequestResponse("Add at least one GBP keyword in Settings → Search rankings");
    }
    if (cities.length === 0) {
      return badRequestResponse("Add at least one target location in Settings → Search rankings");
    }

    const trackedName = company.googleBusinessLocationTitle ?? company.name;
    const data = await getSerpRankings({
      companyId: user.companyId,
      channel: "GBP",
      keyword: selectedKeyword,
      trackedName,
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
