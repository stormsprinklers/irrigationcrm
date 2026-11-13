import { TimeOffStatus, UserRole, VisitStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { isFieldRole } from "@/lib/employees";
import { prisma } from "@/lib/prisma";

const TECHNICIAN_ROLES = [UserRole.TECH, UserRole.INSTALLER];

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const { searchParams } = request.nextUrl;
    const userIds = [...new Set(searchParams.getAll("userIds").filter(Boolean))];
    const start = new Date(searchParams.get("start") ?? "");
    const end = new Date(searchParams.get("end") ?? "");

    if (!userIds.length) return NextResponse.json({ technicians: [] });
    if (userIds.length > 20) return badRequestResponse("Choose no more than 20 technicians");
    if (isFieldRole(user.role) && userIds.some((id) => id !== user.id)) {
      return forbiddenResponse();
    }
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end <= start ||
      end.getTime() - start.getTime() > 48 * 60 * 60 * 1000
    ) {
      return badRequestResponse("Choose a valid schedule day");
    }

    const technicians = await prisma.user.findMany({
      where: {
        id: { in: userIds },
        companyId: user.companyId,
        status: "ACTIVE",
        role: { in: TECHNICIAN_ROLES },
      },
      select: { id: true, name: true },
    });
    const validIds = technicians.map((technician) => technician.id);
    if (validIds.length !== userIds.length) {
      return badRequestResponse("One or more selected technicians are unavailable");
    }

    const [visits, timeOff] = await Promise.all([
      prisma.visit.findMany({
        where: {
          companyId: user.companyId,
          status: { notIn: [VisitStatus.CANCELLED, VisitStatus.UNSCHEDULED] },
          startAt: { lt: end },
          endAt: { gt: start },
          OR: [
            { assignedUserId: { in: validIds } },
            { additionalAssignees: { some: { userId: { in: validIds } } } },
            {
              crew: {
                is: {
                  OR: [
                    { foremanUserId: { in: validIds } },
                    { members: { some: { userId: { in: validIds } } } },
                  ],
                },
              },
            },
          ],
        },
        orderBy: { startAt: "asc" },
        select: {
          id: true,
          title: true,
          startAt: true,
          endAt: true,
          city: true,
          customer: { select: { name: true } },
          assignedUserId: true,
          additionalAssignees: { select: { userId: true } },
          crew: {
            select: {
              foremanUserId: true,
              members: { select: { userId: true } },
            },
          },
        },
      }),
      prisma.timeOffRequest.findMany({
        where: {
          companyId: user.companyId,
          userId: { in: validIds },
          status: TimeOffStatus.APPROVED,
          startAt: { lt: end },
          endAt: { gt: start },
        },
        select: {
          id: true,
          userId: true,
          startAt: true,
          endAt: true,
          type: true,
          reason: true,
        },
      }),
    ]);

    const entriesByTechnician = new Map<
      string,
      Array<{
        id: string;
        kind: "VISIT" | "TIME_OFF";
        title: string;
        startAt: string;
        endAt: string;
        customerName: string | null;
        city: string | null;
      }>
    >(validIds.map((id) => [id, []]));

    for (const visit of visits) {
      const assigneeIds = new Set([
        ...(visit.assignedUserId ? [visit.assignedUserId] : []),
        ...visit.additionalAssignees.map((assignment) => assignment.userId),
        ...(visit.crew?.foremanUserId ? [visit.crew.foremanUserId] : []),
        ...(visit.crew?.members.map((member) => member.userId) ?? []),
      ]);
      for (const technicianId of validIds) {
        if (!assigneeIds.has(technicianId)) continue;
        entriesByTechnician.get(technicianId)?.push({
          id: visit.id,
          kind: "VISIT",
          title: visit.title,
          startAt: visit.startAt.toISOString(),
          endAt: visit.endAt.toISOString(),
          customerName: visit.customer?.name ?? null,
          city: visit.city,
        });
      }
    }

    for (const entry of timeOff) {
      entriesByTechnician.get(entry.userId)?.push({
        id: entry.id,
        kind: "TIME_OFF",
        title: entry.reason?.trim() || entry.type.replaceAll("_", " "),
        startAt: entry.startAt.toISOString(),
        endAt: entry.endAt.toISOString(),
        customerName: null,
        city: null,
      });
    }

    return NextResponse.json({
      technicians: userIds.map((id) => {
        const technician = technicians.find((entry) => entry.id === id)!;
        return {
          ...technician,
          entries: (entriesByTechnician.get(id) ?? []).sort(
            (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
          ),
        };
      }),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("[schedule/technician-day-preview] failed", error);
    return NextResponse.json({ error: "Failed to load technician schedules" }, { status: 500 });
  }
}
