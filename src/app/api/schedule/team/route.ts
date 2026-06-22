import { NextRequest, NextResponse } from "next/server";
import { TimeOffStatus } from "@prisma/client";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import {
  canManageTeamSchedule,
  getEmployeeWorkSchedule,
  listTimeOffRequests,
  saveEmployeeWorkSchedule,
} from "@/lib/schedule/time-off";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const { searchParams } = request.nextUrl;
    const userId = searchParams.get("userId");
    const startParam = searchParams.get("start");
    const endParam = searchParams.get("end");

    if (!userId) return badRequestResponse("userId is required");

    const target = await prisma.user.findFirst({
      where: { id: userId, companyId: user.companyId, status: "ACTIVE" },
      select: { id: true, name: true, color: true, role: true },
    });
    if (!target) return badRequestResponse("Employee not found");

    const isSelf = user.id === userId;
    if (!isSelf && !canManageTeamSchedule(user.role)) {
      return forbiddenResponse();
    }

    const start = startParam ? new Date(startParam) : undefined;
    const end = endParam ? new Date(endParam) : undefined;

    const [workSchedule, timeOff] = await Promise.all([
      getEmployeeWorkSchedule(user.companyId, userId),
      listTimeOffRequests(user.companyId, { userId, start, end }),
    ]);

    return NextResponse.json({ employee: target, workSchedule, timeOff });
  } catch {
    return unauthorizedResponse();
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canManageTeamSchedule(user.role)) return forbiddenResponse();

    const body = await request.json();
    const { userId, days } = body;
    if (!userId || !Array.isArray(days)) {
      return badRequestResponse("userId and days are required");
    }

    const target = await prisma.user.findFirst({
      where: { id: userId, companyId: user.companyId },
      select: { id: true },
    });
    if (!target) return badRequestResponse("Employee not found");

    const workSchedule = await saveEmployeeWorkSchedule(user.companyId, userId, days);
    return NextResponse.json({ workSchedule });
  } catch {
    return unauthorizedResponse();
  }
}
