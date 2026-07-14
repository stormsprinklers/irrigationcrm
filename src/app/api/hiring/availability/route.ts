import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { getHiringManagerSlots } from "@/lib/hiring/availability";
import { canAccessHiring } from "@/lib/hiring/permissions";
import { DEFAULT_BUSINESS_HOURS } from "@/lib/company/types";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canAccessHiring(user.role)) return forbiddenResponse();

    const userId = request.nextUrl.searchParams.get("userId") ?? user.id;
    const manager = await prisma.user.findFirst({
      where: {
        id: userId,
        companyId: user.companyId,
        role: { in: ["ADMIN", "MANAGER"] },
      },
      select: { id: true, name: true },
    });
    if (!manager) return badRequestResponse("Invalid manager");

    const availability = await prisma.hiringManagerAvailability.findUnique({
      where: { userId: manager.id },
    });

    const previewSlots = await getHiringManagerSlots({
      companyId: user.companyId,
      managerUserId: manager.id,
    });

    return NextResponse.json({
      userId: manager.id,
      managerName: manager.name,
      weeklyHours: availability?.weeklyHours ?? DEFAULT_BUSINESS_HOURS,
      blockedSlots: availability?.blockedSlots ?? [],
      leadTimeHours: availability?.leadTimeHours ?? 2,
      previewSlots: previewSlots.slice(0, 20),
    });
  } catch {
    return unauthorizedResponse();
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canAccessHiring(user.role)) return forbiddenResponse();
    const body = await request.json();
    const userId = String(body.userId ?? user.id).trim();

    const manager = await prisma.user.findFirst({
      where: {
        id: userId,
        companyId: user.companyId,
        role: { in: ["ADMIN", "MANAGER"] },
      },
    });
    if (!manager) return badRequestResponse("Invalid manager");

    const leadTimeHours =
      typeof body.leadTimeHours === "number" && Number.isFinite(body.leadTimeHours)
        ? Math.max(0, Math.min(72, Math.round(body.leadTimeHours)))
        : 2;

    const availability = await prisma.hiringManagerAvailability.upsert({
      where: { userId: manager.id },
      create: {
        companyId: user.companyId,
        userId: manager.id,
        weeklyHours: body.weeklyHours ?? DEFAULT_BUSINESS_HOURS,
        blockedSlots: body.blockedSlots ?? [],
        leadTimeHours,
      },
      update: {
        ...(body.weeklyHours !== undefined ? { weeklyHours: body.weeklyHours } : {}),
        ...(body.blockedSlots !== undefined ? { blockedSlots: body.blockedSlots } : {}),
        leadTimeHours,
      },
    });

    return NextResponse.json({
      userId: availability.userId,
      weeklyHours: availability.weeklyHours,
      blockedSlots: availability.blockedSlots,
      leadTimeHours: availability.leadTimeHours,
    });
  } catch {
    return unauthorizedResponse();
  }
}
