import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { canManageEmployees } from "@/lib/employees";
import { prisma } from "@/lib/prisma";
import {
  extractPlaceIdFromInput,
  getPlaceDetails,
  placeToSupplierData,
  searchPlaces,
} from "@/lib/parts-suppliers/places";
import { serializePartsSupplier } from "@/lib/parts-suppliers/serialize";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const suppliers = await prisma.partsSupplier.findMany({
      where: { companyId: user.companyId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return NextResponse.json(suppliers.map(serializePartsSupplier));
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canManageEmployees(user.role)) return forbiddenResponse();

    const body = await request.json();
    const { googlePlaceId, searchQuery } = body as {
      googlePlaceId?: string;
      searchQuery?: string;
    };

    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: { timezone: true },
    });
    const timezone = company?.timezone ?? "America/Denver";

    let placeId = googlePlaceId ? String(googlePlaceId) : null;
    if (!placeId && searchQuery) {
      const fromInput = extractPlaceIdFromInput(searchQuery);
      if (fromInput) {
        placeId = fromInput;
      } else {
        const results = await searchPlaces(String(searchQuery));
        if (!results.length) {
          return badRequestResponse("No matching businesses found on Google Maps");
        }
        placeId = results[0].googlePlaceId;
      }
    }

    if (!placeId) {
      return badRequestResponse("googlePlaceId or searchQuery is required");
    }

    const place = await getPlaceDetails(placeId);
    const supplierData = placeToSupplierData(place, timezone);

    const supplier = await prisma.partsSupplier.upsert({
      where: {
        companyId_googlePlaceId: {
          companyId: user.companyId,
          googlePlaceId: placeId,
        },
      },
      create: {
        companyId: user.companyId,
        sortOrder: body.sortOrder ?? 0,
        ...supplierData,
      },
      update: {
        ...supplierData,
        isActive: true,
      },
    });

    return NextResponse.json(serializePartsSupplier(supplier), { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message = error instanceof Error ? error.message : "Failed to add supplier";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
