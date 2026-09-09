import { NextRequest, NextResponse } from "next/server";
import { WinterizationRequestStatus } from "@prisma/client";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { irrigationFeaturesEnabled } from "@/lib/company/features";
import { canViewWinterizationNav } from "@/lib/settings/access";
import { winterizationSeasonYear } from "@/lib/winterization/weeks";

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

    return NextResponse.json({
      seasonYear,
      requests: rows.map((row) => ({
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
      })),
    });
  } catch {
    return unauthorizedResponse();
  }
}
