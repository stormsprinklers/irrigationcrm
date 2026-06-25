import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canManageCustomers } from "@/lib/customers/permissions";
import type { SerpRankingsSettings } from "@/lib/local-seo/types";
import { prisma } from "@/lib/prisma";

type CityInput = {
  serpApiId?: string | null;
  googleId?: number | null;
  name?: string;
  canonicalName?: string;
  countryCode?: string;
  targetType?: string;
  latitude?: number;
  longitude?: number;
};

function mapSettings(
  company: { organicSearchWebsiteUrl: string | null },
  keywords: Array<{ id: string; keyword: string; sortOrder: number; channel: "GBP" | "ORGANIC" }>,
  cities: Array<{
    id: string;
    serpApiId: string | null;
    googleId: number | null;
    name: string;
    canonicalName: string;
    countryCode: string;
    targetType: string;
    latitude: number;
    longitude: number;
    sortOrder: number;
  }>
): SerpRankingsSettings {
  return {
    organicSearchWebsiteUrl: company.organicSearchWebsiteUrl,
    gbpKeywords: keywords
      .filter((keyword) => keyword.channel === "GBP")
      .map((keyword) => ({ ...keyword, channel: "GBP" as const })),
    organicKeywords: keywords
      .filter((keyword) => keyword.channel === "ORGANIC")
      .map((keyword) => ({ ...keyword, channel: "ORGANIC" as const })),
    cities: cities.map((city) => ({
      id: city.id,
      serpApiId: city.serpApiId,
      googleId: city.googleId,
      name: city.name,
      canonicalName: city.canonicalName,
      countryCode: city.countryCode,
      targetType: city.targetType,
      latitude: city.latitude,
      longitude: city.longitude,
      sortOrder: city.sortOrder,
    })),
  };
}

function normalizeKeywords(values: unknown[]) {
  return values
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .map((keyword, index) => ({ keyword, sortOrder: index }));
}

function normalizeCities(cities: CityInput[]) {
  return cities
    .map((city, index) => {
      const name = String(city.name ?? "").trim();
      const canonicalName = String(city.canonicalName ?? "").trim();
      const latitude = Number(city.latitude);
      const longitude = Number(city.longitude);
      if (!name || !canonicalName || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return null;
      }
      return {
        serpApiId: city.serpApiId ? String(city.serpApiId) : null,
        googleId: city.googleId != null ? Number(city.googleId) : null,
        name,
        canonicalName,
        countryCode: city.countryCode ? String(city.countryCode) : "US",
        targetType: city.targetType ? String(city.targetType) : "City",
        latitude,
        longitude,
        sortOrder: index,
      };
    })
    .filter(Boolean) as Array<{
    serpApiId: string | null;
    googleId: number | null;
    name: string;
    canonicalName: string;
    countryCode: string;
    targetType: string;
    latitude: number;
    longitude: number;
    sortOrder: number;
  }>;
}

export async function GET() {
  try {
    const user = await requireSessionUser();
    const [company, keywords, cities] = await Promise.all([
      prisma.company.findUnique({
        where: { id: user.companyId },
        select: { organicSearchWebsiteUrl: true },
      }),
      prisma.localSeoKeyword.findMany({
        where: { companyId: user.companyId },
        orderBy: [{ channel: "asc" }, { sortOrder: "asc" }, { keyword: "asc" }],
        select: { id: true, keyword: true, sortOrder: true, channel: true },
      }),
      prisma.localSeoTargetCity.findMany({
        where: { companyId: user.companyId },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          serpApiId: true,
          googleId: true,
          name: true,
          canonicalName: true,
          countryCode: true,
          targetType: true,
          latitude: true,
          longitude: true,
          sortOrder: true,
        },
      }),
    ]);

    if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json(mapSettings(company, keywords, cities));
  } catch {
    return unauthorizedResponse();
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canManageCustomers(user.role)) return forbiddenResponse();

    const body = await request.json();
    const gbpKeywords = Array.isArray(body.gbpKeywords) ? body.gbpKeywords : null;
    const organicKeywords = Array.isArray(body.organicKeywords) ? body.organicKeywords : null;
    const cities = Array.isArray(body.cities) ? body.cities : null;

    if (!gbpKeywords || !organicKeywords || !cities) {
      return badRequestResponse("gbpKeywords, organicKeywords, and cities arrays are required");
    }

    const normalizedGbpKeywords = normalizeKeywords(gbpKeywords);
    const normalizedOrganicKeywords = normalizeKeywords(organicKeywords);
    const normalizedCities = normalizeCities(cities);
    const organicSearchWebsiteUrl =
      body.organicSearchWebsiteUrl != null ? String(body.organicSearchWebsiteUrl).trim() : "";

    await prisma.$transaction(async (tx) => {
      await tx.company.update({
        where: { id: user.companyId },
        data: {
          organicSearchWebsiteUrl: organicSearchWebsiteUrl || null,
        },
      });

      await tx.localSeoKeyword.deleteMany({ where: { companyId: user.companyId } });
      await tx.localSeoTargetCity.deleteMany({ where: { companyId: user.companyId } });

      const keywordRows = [
        ...normalizedGbpKeywords.map((keyword) => ({
          companyId: user.companyId,
          channel: "GBP" as const,
          keyword: keyword.keyword,
          sortOrder: keyword.sortOrder,
        })),
        ...normalizedOrganicKeywords.map((keyword) => ({
          companyId: user.companyId,
          channel: "ORGANIC" as const,
          keyword: keyword.keyword,
          sortOrder: keyword.sortOrder,
        })),
      ];

      if (keywordRows.length) {
        await tx.localSeoKeyword.createMany({ data: keywordRows });
      }

      if (normalizedCities.length) {
        await tx.localSeoTargetCity.createMany({
          data: normalizedCities.map((city) => ({
            companyId: user.companyId,
            ...city,
          })),
        });
      }
    });

    const [company, nextKeywords, nextCities] = await Promise.all([
      prisma.company.findUnique({
        where: { id: user.companyId },
        select: { organicSearchWebsiteUrl: true },
      }),
      prisma.localSeoKeyword.findMany({
        where: { companyId: user.companyId },
        orderBy: [{ channel: "asc" }, { sortOrder: "asc" }, { keyword: "asc" }],
        select: { id: true, keyword: true, sortOrder: true, channel: true },
      }),
      prisma.localSeoTargetCity.findMany({
        where: { companyId: user.companyId },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          serpApiId: true,
          googleId: true,
          name: true,
          canonicalName: true,
          countryCode: true,
          targetType: true,
          latitude: true,
          longitude: true,
          sortOrder: true,
        },
      }),
    ]);

    if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json(mapSettings(company, nextKeywords, nextCities));
  } catch {
    return unauthorizedResponse();
  }
}
