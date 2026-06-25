import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getLocalSeoRankings } from "@/lib/local-seo/rankings-service";
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
        where: { companyId: user.companyId },
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
      return badRequestResponse("Add at least one keyword in local SEO settings");
    }
    if (cities.length === 0) {
      return badRequestResponse("Add at least one target city in local SEO settings");
    }

    const businessName = company.googleBusinessLocationTitle ?? company.name;
    const data = await getLocalSeoRankings({
      companyId: user.companyId,
      keyword: selectedKeyword,
      businessName,
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
