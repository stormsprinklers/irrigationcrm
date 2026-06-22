import { NextRequest, NextResponse } from "next/server";
import { TimeOffStatus, TimeOffType } from "@prisma/client";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import {
  canManageTeamSchedule,
  canReviewTimeOff,
  listTimeOffRequests,
  serializeTimeOffRequest,
} from "@/lib/schedule/time-off";

const timeOffInclude = {
  user: { select: { name: true } },
  reviewedBy: { select: { name: true } },
  createdBy: { select: { name: true } },
} as const;

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const { searchParams } = request.nextUrl;
    const startParam = searchParams.get("start");
    const endParam = searchParams.get("end");
    const userId = searchParams.get("userId") ?? undefined;
    const statusParam = searchParams.get("status")?.toUpperCase() as TimeOffStatus | undefined;

    const start = startParam ? new Date(startParam) : undefined;
    const end = endParam ? new Date(endParam) : undefined;

    if (userId && userId !== user.id && !canManageTeamSchedule(user.role)) {
      return forbiddenResponse();
    }

    const effectiveUserId = canManageTeamSchedule(user.role) ? userId : user.id;

    const requests = await listTimeOffRequests(user.companyId, {
      start,
      end,
      userId: effectiveUserId,
      status: statusParam,
    });

    return NextResponse.json({ requests });
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const body = await request.json();
    const {
      userId: targetUserId,
      startAt,
      endAt,
      allDay = true,
      type = "TIME_OFF",
      reason,
      approveImmediately = false,
    } = body;

    if (!startAt || !endAt) {
      return badRequestResponse("startAt and endAt are required");
    }

    const start = new Date(startAt);
    const end = new Date(endAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return badRequestResponse("Invalid time range");
    }

    const requestedFor = targetUserId ?? user.id;
    const isSelf = requestedFor === user.id;
    if (!isSelf && !canManageTeamSchedule(user.role)) {
      return forbiddenResponse();
    }

    const employee = await prisma.user.findFirst({
      where: { id: requestedFor, companyId: user.companyId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!employee) return badRequestResponse("Employee not found");

    let status: TimeOffStatus = TimeOffStatus.PENDING;
    let reviewedById: string | null = null;
    let reviewedAt: Date | null = null;

    if (approveImmediately && canManageTeamSchedule(user.role)) {
      status = TimeOffStatus.APPROVED;
      reviewedById = user.id;
      reviewedAt = new Date();
    } else if (isSelf && !canManageTeamSchedule(user.role)) {
      status = TimeOffStatus.PENDING;
    } else if (canManageTeamSchedule(user.role) && !isSelf) {
      status = TimeOffStatus.APPROVED;
      reviewedById = user.id;
      reviewedAt = new Date();
    }

    const entry = await prisma.timeOffRequest.create({
      data: {
        companyId: user.companyId,
        userId: requestedFor,
        startAt: start,
        endAt: end,
        allDay: Boolean(allDay),
        type: type as TimeOffType,
        status,
        reason: reason ? String(reason) : null,
        reviewedById,
        reviewedAt,
        createdById: user.id,
      },
      include: timeOffInclude,
    });

    return NextResponse.json(serializeTimeOffRequest(entry), { status: 201 });
  } catch {
    return unauthorizedResponse();
  }
}
