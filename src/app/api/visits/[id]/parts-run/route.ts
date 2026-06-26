import { NextRequest, NextResponse } from "next/server";
import { TimeEventType, VisitStatus } from "@prisma/client";
import {
  badRequestResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { geocodeAddress, getGoogleMapsApiKey } from "@/lib/customers/maps";
import { formatPostalAddress, googleMapsDirectionsUrl } from "@/lib/maps";
import { resolveVisitDestination } from "@/lib/maps/eta";
import { prisma } from "@/lib/prisma";
import { rankSuppliersForPartsRun } from "@/lib/parts-suppliers/recommendations";
import { serializePartsSupplier } from "@/lib/parts-suppliers/serialize";
import { getVisitForCompany } from "@/lib/visits/queries";

type RouteContext = { params: Promise<{ id: string }> };

async function resolveVisitOrigin(
  visit: NonNullable<Awaited<ReturnType<typeof getVisitForCompany>>>,
  originLat?: number | null,
  originLng?: number | null
) {
  if (originLat != null && originLng != null) {
    return { lat: originLat, lng: originLng };
  }

  if (visit.property?.latitude != null && visit.property.longitude != null) {
    return { lat: visit.property.latitude, lng: visit.property.longitude };
  }

  const destination = resolveVisitDestination({
    address: visit.address,
    city: visit.city,
    state: visit.state,
    zip: visit.zip,
    property: visit.property,
    customer: visit.customer,
  });

  if (!destination) return null;

  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) return null;

  const geocoded = await geocodeAddress(destination, apiKey);
  if (!geocoded) return null;
  return { lat: geocoded.lat, lng: geocoded.lng };
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    const { id } = await context.params;
    const visit = await getVisitForCompany(user.companyId, id);
    if (!visit) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const url = new URL(request.url);
    const originLat = url.searchParams.get("originLat");
    const originLng = url.searchParams.get("originLng");

    const origin = await resolveVisitOrigin(
      visit,
      originLat ? Number(originLat) : null,
      originLng ? Number(originLng) : null
    );

    if (!origin) {
      return badRequestResponse("Could not determine job location for routing");
    }

    const [suppliers, company] = await Promise.all([
      prisma.partsSupplier.findMany({
        where: { companyId: user.companyId, isActive: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      prisma.company.findUnique({
        where: { id: user.companyId },
        select: { timezone: true },
      }),
    ]);

    if (!suppliers.length) {
      return NextResponse.json({
        options: [],
        message: "No parts suppliers configured. Add suppliers in Settings → Parts Run.",
      });
    }

    const options = await rankSuppliersForPartsRun({
      suppliers: suppliers.map(serializePartsSupplier),
      originLat: origin.lat,
      originLng: origin.lng,
      timezone: company?.timezone ?? "America/Denver",
      limit: 2,
    });

    return NextResponse.json({
      options,
      closedCount: suppliers.length - options.length,
      message:
        options.length === 0
          ? "No configured suppliers are open right now. Call a supplier to check hours."
          : null,
    });
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    const { id } = await context.params;
    const visit = await getVisitForCompany(user.companyId, id);
    if (!visit) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();
    const supplierId = String(body.supplierId ?? "");
    if (!supplierId) return badRequestResponse("supplierId is required");

    const supplier = await prisma.partsSupplier.findFirst({
      where: { id: supplierId, companyId: user.companyId, isActive: true },
    });
    if (!supplier) return NextResponse.json({ error: "Supplier not found" }, { status: 404 });

    let paused = false;
    if (visit.status === VisitStatus.IN_PROGRESS) {
      await prisma.visitTimeEvent.create({
        data: { visitId: id, userId: user.id, type: TimeEventType.PAUSE },
      });
      await prisma.visit.update({
        where: { id },
        data: { status: VisitStatus.PAUSED },
      });
      paused = true;
    }

    const address =
      formatPostalAddress({
        address: supplier.address,
        city: supplier.city,
        state: supplier.state,
        zip: supplier.zip,
      }) ?? supplier.name;

    return NextResponse.json({
      paused,
      mapsUrl: googleMapsDirectionsUrl(address),
      supplier: serializePartsSupplier(supplier),
    });
  } catch {
    return unauthorizedResponse();
  }
}
