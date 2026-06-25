import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canManageCustomers } from "@/lib/customers/permissions";
import { prisma } from "@/lib/prisma";
import type { LocalSeoSettings } from "@/lib/local-seo/types";

function mapSettings(
  keywords: Array<{ id: string; keyword: string; sortOrder: number }>,
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
): LocalSeoSettings {
  return {
    keywords: keywords.map((keyword) => ({
      id: keyword.id,
      keyword: keyword.keyword,
      sortOrder: keyword.sortOrder,
    })),
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

export async function GET() {
  try {
    const user = await requireSessionUser();
    const [keywords, cities] = await Promise.all([
      prisma.localSeoKeyword.findMany({
        where: { companyId: user.companyId },
        orderBy: [{ sortOrder: "asc" }, { keyword: "asc" }],
        select: { id: true, keyword: true, sortOrder: true },
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

    return NextResponse.json(mapSettings(keywords, cities));
  } catch {
    return unauthorizedResponse();
  }
}

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

export async function PUT(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canManageCustomers(user.role)) return forbiddenResponse();

    const body = await request.json();
    const keywords = Array.isArray(body.keywords) ? body.keywords : null;
    const cities = Array.isArray(body.cities) ? body.cities : null;

    if (!keywords || !cities) {
      return badRequestResponse("keywords and cities arrays are required");
    }

    const normalizedKeywords = keywords
      .map((value: unknown, index: number) => String(value ?? "").trim())
      .filter(Boolean)
      .map((keyword: string, index: number) => ({ keyword, sortOrder: index }));

    const normalizedCities = cities
      .map((city: CityInput, index: number) => {
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

    await prisma.$transaction(async (tx) => {
      await tx.localSeoKeyword.deleteMany({ where: { companyId: user.companyId } });
      await tx.localSeoTargetCity.deleteMany({ where: { companyId: user.companyId } });

      if (normalizedKeywords.length) {
        await tx.localSeoKeyword.createMany({
          data: normalizedKeywords.map((keyword: { keyword: string; sortOrder: number }) => ({
            companyId: user.companyId,
            keyword: keyword.keyword,
            sortOrder: keyword.sortOrder,
          })),
        });
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

    const [nextKeywords, nextCities] = await Promise.all([
      prisma.localSeoKeyword.findMany({
        where: { companyId: user.companyId },
        orderBy: [{ sortOrder: "asc" }, { keyword: "asc" }],
        select: { id: true, keyword: true, sortOrder: true },
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

    return NextResponse.json(mapSettings(nextKeywords, nextCities));
  } catch {
    return unauthorizedResponse();
  }
}
