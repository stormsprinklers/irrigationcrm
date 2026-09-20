import { NextRequest, NextResponse } from "next/server";
import { Division, VisitStatus } from "@prisma/client";
import { forbiddenForFieldRole, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { assertVisitCanComplete } from "@/lib/checklists/apply";
import { syncCallbackTag } from "@/lib/checklists/callback";
import { isFieldRole } from "@/lib/employees";
import { requireFieldVisitAccess } from "@/lib/field/visit-guard";
import { writeStaffAuditLog } from "@/lib/audit/staff-audit";
import { prisma } from "@/lib/prisma";
import { clearNeedsSchedulingForVisit } from "@/lib/estimates/scheduling";
import { onVisitCancelled, onVisitCompleted, onVisitTimeChanged } from "@/lib/notifications/visit-events";
import { getVisitForCompany, serializeVisitDetail } from "@/lib/visits/queries";
import { validateAssignmentUpdate } from "@/lib/schedule/time-off";
import { validateScheduledVisitAssignment } from "@/lib/schedule/visit-assignment";
import { normalizeVisitAssigneeIds } from "@/lib/schedule/assignees";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const access = await requireFieldVisitAccess(user, id);
    if (!access.ok) return access.response;
    const visit = await getVisitForCompany(user.companyId, id);
    if (!visit) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(await serializeVisitDetail(visit));
  } catch {
    return unauthorizedResponse();
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();

    const { id } = await params;
    const access = await requireFieldVisitAccess(user, id);
    if (!access.ok) return access.response;

    const existing = await prisma.visit.findFirst({
      where: { id, companyId: user.companyId },
      include: { additionalAssignees: { select: { userId: true } } },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();

    const fieldSelfScheduleKeys = new Set([
      "workSummary",
      "startAt",
      "endAt",
      "title",
      "address",
      "city",
      "state",
      "zip",
      "tags",
      "isCallback",
    ]);
    const bodyKeys = Object.keys(body);
    const workSummaryOnlyUpdate =
      bodyKeys.length > 0 && bodyKeys.every((key) => key === "workSummary");
    const fieldSelfScheduleUpdate =
      bodyKeys.length > 0 &&
      bodyKeys.every((key) => {
        if (fieldSelfScheduleKeys.has(key)) return true;
        // Field may cancel own visits (keeps the record for reporting) but cannot set other statuses.
        if (key === "status" && body.status === VisitStatus.CANCELLED) return true;
        return false;
      });

    if (isFieldRole(user.role)) {
      if (!fieldSelfScheduleUpdate && !workSummaryOnlyUpdate) {
        return forbiddenResponse("Field roles may only update work summary or reschedule own visits");
      }
      if (body.assignedUserId !== undefined && body.assignedUserId !== user.id) {
        return forbiddenResponse("Field roles may only assign visits to themselves");
      }
      if (body.crewId !== undefined) {
        return forbiddenResponse("Field roles may not change crew assignment");
      }
    }

    const nextStart = body.startAt !== undefined ? new Date(body.startAt) : existing.startAt;
    const nextEnd = body.endAt !== undefined ? new Date(body.endAt) : existing.endAt;
    const assignmentChanged = body.assignedUserIds !== undefined || body.assignedUserId !== undefined;
    const nextAssignedUserIds = normalizeVisitAssigneeIds(
      body.assignedUserIds,
      body.assignedUserId,
      [
        ...(existing.assignedUserId ? [existing.assignedUserId] : []),
        ...existing.additionalAssignees.map((entry) => entry.userId),
      ]
    );
    if (nextAssignedUserIds.length > 20) {
      return NextResponse.json({ error: "A visit can have up to 20 assigned technicians" }, { status: 400 });
    }
    const nextAssignedUserId = nextAssignedUserIds[0] ?? null;
    const nextCrewId =
      body.crewId !== undefined ? (body.crewId ? String(body.crewId) : null) : existing.crewId;
    const nextStatus =
      body.status !== undefined ? (body.status as VisitStatus) : existing.status;

    if (nextCrewId && nextAssignedUserIds.length) {
      return NextResponse.json(
        { error: "Assign either a crew or individual technicians, not both" },
        { status: 400 }
      );
    }

    const availabilityChecks = await Promise.all(
      nextAssignedUserIds.map((employeeId) =>
        validateAssignmentUpdate(user.companyId, employeeId, nextStart, nextEnd, id)
      )
    );
    const availabilityError = availabilityChecks.find((result) => result.error)?.error;
    if (availabilityError) {
      return NextResponse.json({ error: availabilityError }, { status: 400 });
    }
    const availabilityWarnings = availabilityChecks
      .map((result) => result.warning)
      .filter((warning): warning is string => Boolean(warning));

    const assignmentError = validateScheduledVisitAssignment(
      nextStatus,
      nextAssignedUserId,
      nextCrewId
    );
    if (assignmentError) {
      return NextResponse.json({ error: assignmentError }, { status: 400 });
    }

    if (body.status === VisitStatus.COMPLETED) {
      const checklistError = await assertVisitCanComplete(id, user.companyId);
      if (checklistError) {
        return NextResponse.json({ error: checklistError }, { status: 400 });
      }
    }

    let nextTags = existing.tags;
    let nextIsCallback = existing.isCallback;
    if (body.isCallback !== undefined) {
      nextIsCallback = Boolean(body.isCallback);
      nextTags = syncCallbackTag(
        body.tags !== undefined ? (Array.isArray(body.tags) ? body.tags : []) : existing.tags,
        nextIsCallback
      );
    } else if (body.tags !== undefined) {
      nextTags = Array.isArray(body.tags) ? body.tags : [];
      nextIsCallback = nextTags.some((t) => t.toLowerCase() === "callback");
    }

    await prisma.$transaction(async (tx) => {
      if (assignmentChanged) {
        await tx.visitAssignee.deleteMany({ where: { visitId: id } });
        if (nextAssignedUserIds.length > 1) {
          await tx.visitAssignee.createMany({
            data: nextAssignedUserIds.slice(1).map((userId) => ({ visitId: id, userId })),
          });
        }
      }
      await tx.visit.update({
        where: { id },
        data: {
        ...(body.title !== undefined ? { title: String(body.title) } : {}),
        ...(body.startAt !== undefined ? { startAt: new Date(body.startAt) } : {}),
        ...(body.endAt !== undefined ? { endAt: new Date(body.endAt) } : {}),
        ...(body.division !== undefined ? { division: body.division as Division } : {}),
        ...(body.status !== undefined ? { status: body.status as VisitStatus } : {}),
        ...(body.propertyId !== undefined ? { propertyId: body.propertyId ?? null } : {}),
        ...(body.customerId !== undefined ? { customerId: body.customerId ?? null } : {}),
        ...(body.tags !== undefined || body.isCallback !== undefined ? { tags: nextTags } : {}),
        ...(body.isCallback !== undefined ? { isCallback: nextIsCallback } : {}),
          ...(assignmentChanged ? { assignedUserId: nextAssignedUserId } : {}),
        ...(body.crewId !== undefined ? { crewId: body.crewId ?? null } : {}),
        ...(body.installDurationDays !== undefined
          ? { installDurationDays: Math.max(1, Number(body.installDurationDays) || 4) }
          : {}),
        ...(body.workSummary !== undefined
          ? {
              workSummary: body.workSummary ? String(body.workSummary).trim() : null,
              customerWorkSummary: null,
            }
          : {}),
        },
      });
    });

    await clearNeedsSchedulingForVisit(id);

    await writeStaffAuditLog({
      companyId: user.companyId,
      actorId: user.id,
      entityType: "Visit",
      entityId: id,
      action: "update",
      before: {
        startAt: existing.startAt.toISOString(),
        endAt: existing.endAt.toISOString(),
        workSummary: existing.workSummary,
      },
      after: {
        startAt: nextStart.toISOString(),
        endAt: nextEnd.toISOString(),
        workSummary:
          body.workSummary !== undefined
            ? body.workSummary
              ? String(body.workSummary).trim()
              : null
            : existing.workSummary,
      },
      visitId: id,
      customerId: existing.customerId,
    });

    const startChanged =
      body.startAt !== undefined &&
      new Date(body.startAt).getTime() !== existing.startAt.getTime();
    const cancelled =
      body.status === VisitStatus.CANCELLED && existing.status !== VisitStatus.CANCELLED;
    const becameCompleted =
      body.status === VisitStatus.COMPLETED && existing.status !== VisitStatus.COMPLETED;
    const becameScheduled =
      existing.status === VisitStatus.UNSCHEDULED && nextStatus === VisitStatus.SCHEDULED;

    if (cancelled && existing.customerId) {
      void onVisitCancelled(id, user.companyId).catch(() => {});
    } else if (becameCompleted && existing.customerId) {
      void onVisitCompleted(id, user.companyId).catch((err) =>
        console.error("Visit completed notification error:", err)
      );
    } else if (existing.customerId && body.status !== VisitStatus.CANCELLED) {
      if (becameScheduled) {
        void onVisitTimeChanged({
          visitId: id,
          companyId: user.companyId,
          isInitialSchedule: true,
        }).catch(() => {});
      } else if (startChanged) {
        void onVisitTimeChanged({ visitId: id, companyId: user.companyId }).catch(() => {});
      }
    }

    const visit = await getVisitForCompany(user.companyId, id);
    if (!visit) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({
      ...(await serializeVisitDetail(visit)),
      warning: availabilityWarnings.length ? availabilityWarnings.join(" ") : null,
    });
  } catch {
    return unauthorizedResponse();
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const fieldDenied = forbiddenForFieldRole(user.role); if (fieldDenied) return fieldDenied;

    const { id } = await params;
    const result = await prisma.visit.deleteMany({ where: { id, companyId: user.companyId } });
    if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return unauthorizedResponse();
  }
}
