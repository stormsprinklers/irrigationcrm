import { NextRequest, NextResponse } from "next/server";
import { TimeOffStatus, TimeOffType } from "@prisma/client";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { notifyTimeOffRequestSubmitted } from "@/lib/schedule/time-off-notify";
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
      userIds: targetUserIds,
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

    if (!Object.values(TimeOffType).includes(type as TimeOffType)) {
      return badRequestResponse("Invalid time-off type");
    }

    const requestedUserIds = Array.from(
      new Set(
        (Array.isArray(targetUserIds) && targetUserIds.length > 0
          ? targetUserIds
          : [targetUserId ?? user.id]
        )
          .filter((id): id is string => typeof id === "string")
          .map((id) => id.trim())
          .filter(Boolean)
      )
    );
    if (requestedUserIds.length === 0) {
      return badRequestResponse("At least one employee is required");
    }
    if (requestedUserIds.length > 20) {
      return badRequestResponse("Time off can be scheduled for up to 20 employees at once");
    }

    const canManage = canManageTeamSchedule(user.role);
    if (!canManage && requestedUserIds.some((id) => id !== user.id)) {
      return forbiddenResponse();
    }

    const employees = await prisma.user.findMany({
      where: {
        id: { in: requestedUserIds },
        companyId: user.companyId,
        status: "ACTIVE",
      },
      select: { id: true, name: true },
    });
    if (employees.length !== requestedUserIds.length) {
      return badRequestResponse("One or more employees were not found");
    }

    const reviewedAt = new Date();
    const entries = await prisma.$transaction(
      requestedUserIds.map((requestedFor) => {
        const shouldApprove = canManage && (approveImmediately || requestedFor !== user.id);
        return prisma.timeOffRequest.create({
          data: {
            companyId: user.companyId,
            userId: requestedFor,
            startAt: start,
            endAt: end,
            allDay: Boolean(allDay),
            type: type as TimeOffType,
            status: shouldApprove ? TimeOffStatus.APPROVED : TimeOffStatus.PENDING,
            reason: reason ? String(reason) : null,
            reviewedById: shouldApprove ? user.id : null,
            reviewedAt: shouldApprove ? reviewedAt : null,
            createdById: user.id,
          },
          include: timeOffInclude,
        });
      })
    );

    const employeesById = new Map(employees.map((employee) => [employee.id, employee]));
    for (const entry of entries) {
      if (entry.status !== TimeOffStatus.PENDING) continue;
      const employee = employeesById.get(entry.userId);
      await notifyTimeOffRequestSubmitted({
        companyId: user.companyId,
        employeeUserId: entry.userId,
        employeeName: employee?.name?.trim() || "An employee",
        startAt: start,
        endAt: end,
        type: type as string,
        reason: reason ? String(reason) : null,
      }).catch((err) => {
        console.error("Failed to notify time-off reviewers:", err);
      });
    }

    const serialized = entries.map(serializeTimeOffRequest);
    return NextResponse.json(
      Array.isArray(targetUserIds) ? { requests: serialized } : serialized[0],
      { status: 201 }
    );
  } catch {
    return unauthorizedResponse();
  }
}
