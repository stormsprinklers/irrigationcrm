import { NextRequest, NextResponse } from "next/server";
import { WinterizationRequestStatus } from "@prisma/client";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { irrigationFeaturesEnabled } from "@/lib/company/features";
import { canViewWinterizationNav } from "@/lib/settings/access";
import { addCrmWinterizationRequest, WinterizationDuplicateError } from "@/lib/winterization/create";
import { ensureWinterizationSeasonTags } from "@/lib/winterization/tags";
import { listWinterizationWeeks, winterizationSeasonTag, winterizationSeasonYear } from "@/lib/winterization/weeks";

function serializeRequest(row: {
  id: string;
  status: WinterizationRequestStatus;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  zip: string | null;
  zoneCount: number | null;
  quotedPrice: { toString(): string } | number | null;
  weekLabel: string;
  weekStart: Date;
  schedulingNotes: string | null;
  shutoffValveLocation: string | null;
  timerLocation: string | null;
  customerId: string | null;
  customer?: { name: string } | null;
  createdAt: Date;
}) {
  return {
    id: row.id,
    status: row.status,
    name: row.name,
    phone: row.phone,
    email: row.email,
    address: row.address,
    city: row.city,
    zip: row.zip,
    zoneCount: row.zoneCount,
    quotedPrice: row.quotedPrice != null ? Number(row.quotedPrice) : null,
    weekLabel: row.weekLabel,
    weekStart: row.weekStart.toISOString(),
    schedulingNotes: row.schedulingNotes,
    shutoffValveLocation: row.shutoffValveLocation,
    timerLocation: row.timerLocation,
    customerId: row.customerId,
    customerName: row.customer?.name ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: { irrigationFeaturesEnabled: true },
    });
    if (!irrigationFeaturesEnabled(company) || !canViewWinterizationNav(user.role)) {
      return NextResponse.json({ error: "Winterization tools are off" }, { status: 403 });
    }

    const status = request.nextUrl.searchParams.get("status");
    const seasonYear = Number(request.nextUrl.searchParams.get("year")) || winterizationSeasonYear();
    const rows = await prisma.winterizationRequest.findMany({
      where: {
        companyId: user.companyId,
        seasonYear,
        ...(status && status !== "ALL"
          ? { status: status as WinterizationRequestStatus }
          : { status: { in: ["NEED_BOOKING", "SCHEDULED"] } }),
      },
      include: {
        customer: { select: { id: true, name: true } },
      },
      orderBy: [{ weekStart: "asc" }, { createdAt: "asc" }],
      take: 200,
    });

    await ensureWinterizationSeasonTags(
      rows.map((row) => row.customerId),
      seasonYear
    ).catch(() => undefined);

    return NextResponse.json({
      seasonYear,
      seasonTag: winterizationSeasonTag(seasonYear),
      weeks: listWinterizationWeeks(),
      requests: rows.map(serializeRequest),
    });
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: { irrigationFeaturesEnabled: true },
    });
    if (!irrigationFeaturesEnabled(company) || !canViewWinterizationNav(user.role)) {
      return NextResponse.json({ error: "Winterization tools are off" }, { status: 403 });
    }

    let body: Record<string, unknown> = {};
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const zoneRaw = body.zoneCount;
    const zoneCount =
      zoneRaw === "" || zoneRaw == null
        ? null
        : Number(zoneRaw);
    if (zoneCount != null && (!Number.isFinite(zoneCount) || zoneCount < 1 || zoneCount > 99)) {
      return NextResponse.json({ error: "Zones must be a number between 1 and 99" }, { status: 400 });
    }

    try {
      const created = await addCrmWinterizationRequest(user.companyId, {
        customerId: typeof body.customerId === "string" ? body.customerId : null,
        name: typeof body.name === "string" ? body.name : null,
        phone: typeof body.phone === "string" ? body.phone : null,
        email: typeof body.email === "string" ? body.email : null,
        address: typeof body.address === "string" ? body.address : null,
        city: typeof body.city === "string" ? body.city : null,
        state: typeof body.state === "string" ? body.state : null,
        zip: typeof body.zip === "string" ? body.zip : null,
        weekStart: typeof body.weekStart === "string" ? body.weekStart : null,
        zoneCount,
        schedulingNotes: typeof body.schedulingNotes === "string" ? body.schedulingNotes : null,
      });
      return NextResponse.json(
        { request: serializeRequest({ ...created, customer: null }) },
        { status: 201 }
      );
    } catch (err) {
      if (err instanceof WinterizationDuplicateError) {
        return NextResponse.json({ error: err.message }, { status: 409 });
      }
      const message = err instanceof Error ? err.message : "Failed to add to winterization list";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  } catch {
    return unauthorizedResponse();
  }
}
