import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { buildMockRankingsResponse } from "@/lib/local-seo/mock-rankings";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const keyword = request.nextUrl.searchParams.get("keyword")?.trim();

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
    const data = buildMockRankingsResponse({
      cities,
      keyword: selectedKeyword,
      businessName,
    });

    return NextResponse.json(data);
  } catch {
    return unauthorizedResponse();
  }
}
