import { NextRequest, NextResponse } from "next/server";
import { TechTimeCategory, TechTimeCorrectionStatus, TechTimeSegmentSource } from "@prisma/client";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { isFieldRole } from "@/lib/employees";
import { requireFieldVisitAccess } from "@/lib/field/visit-guard";
import {
  getOpenTimeSegment,
  serializeTimeSegment,
  startTimeSegment,
  stopOpenTimeSegment,
} from "@/lib/field/time-segments";
import { prisma } from "@/lib/prisma";
import { writeStaffAuditLog } from "@/lib/audit/staff-audit";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser(request);
    const { searchParams } = request.nextUrl;
    const openOnly = searchParams.get("open") === "1";
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? 50)));

    const segments = await prisma.techTimeSegment.findMany({
      where: {
        companyId: user.companyId,
        userId: user.id,
        ...(openOnly ? { endedAt: null } : {}),
      },
      orderBy: { startedAt: "desc" },
      take: limit,
    });

    const open = segments.find((s) => !s.endedAt) ?? null;
    return NextResponse.json({
      open: open ? serializeTimeSegment(open) : null,
      segments: segments.map(serializeTimeSegment),
    });
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser(request);
    const body = await request.json();
    const action = String(body.action ?? "start");
    const deviceId = body.deviceId ? String(body.deviceId) : null;

    if (action === "stop" || action === "pause") {
      const stopped = await stopOpenTimeSegment({
        companyId: user.companyId,
        userId: user.id,
        deviceId,
      });
      return NextResponse.json({
        segment: stopped ? serializeTimeSegment(stopped) : null,
      });
    }

    if (action === "start" || action === "resume") {
      const category = body.category as TechTimeCategory;
      if (!Object.values(TechTimeCategory).includes(category)) {
        return badRequestResponse("Invalid category");
      }
      const visitId = body.visitId ? String(body.visitId) : null;
      if (visitId) {
        const access = await requireFieldVisitAccess(user, visitId);
        if (!access.ok) return access.response;
      }

      // Resume = stop current then start new category
      if (action === "resume" || (await getOpenTimeSegment(user.companyId, user.id))) {
        await stopOpenTimeSegment({
          companyId: user.companyId,
          userId: user.id,
          deviceId,
        });
      }

      try {
        const segment = await startTimeSegment({
          companyId: user.companyId,
          userId: user.id,
          category,
          visitId,
          source: TechTimeSegmentSource.MOBILE,
          deviceId,
        });
        return NextResponse.json({ segment: serializeTimeSegment(segment) });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to start segment";
        return badRequestResponse(message);
      }
    }

    if (action === "correct") {
      const segmentId = String(body.segmentId ?? "");
      if (!segmentId) return badRequestResponse("segmentId required");
      const segment = await prisma.techTimeSegment.findFirst({
        where: { id: segmentId, companyId: user.companyId, userId: user.id },
      });
      if (!segment) return NextResponse.json({ error: "Not found" }, { status: 404 });

      const correction = await prisma.techTimeCorrection.create({
        data: {
          companyId: user.companyId,
          segmentId,
          requestedById: user.id,
          status: TechTimeCorrectionStatus.PENDING,
          requestedStart: body.requestedStart ? new Date(body.requestedStart) : null,
          requestedEnd: body.requestedEnd ? new Date(body.requestedEnd) : null,
          requestedCategory: body.requestedCategory
            ? (body.requestedCategory as TechTimeCategory)
            : null,
          note: body.note ? String(body.note) : null,
        },
      });

      await writeStaffAuditLog({
        companyId: user.companyId,
        actorId: user.id,
        entityType: "TechTimeCorrection",
        entityId: correction.id,
        action: "request",
        visitId: segment.visitId,
      });

      return NextResponse.json({ correction });
    }

    return badRequestResponse("Unknown action");
  } catch {
    return unauthorizedResponse();
  }
}

/** Admin/manager review of correction requests */
export async function PATCH(request: NextRequest) {
  try {
    const user = await requireSessionUser(request);
    if (isFieldRole(user.role)) {
      return forbiddenResponse("Only managers can review time corrections");
    }
    const body = await request.json();
    const correctionId = String(body.correctionId ?? "");
    const status = String(body.status ?? "");
    if (
      !correctionId ||
      (status !== TechTimeCorrectionStatus.APPROVED && status !== TechTimeCorrectionStatus.REJECTED)
    ) {
      return badRequestResponse("correctionId and status (APPROVED|REJECTED) required");
    }

    const correction = await prisma.techTimeCorrection.findFirst({
      where: { id: correctionId, companyId: user.companyId },
      include: { segment: true },
    });
    if (!correction) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const nextStatus =
      status === TechTimeCorrectionStatus.APPROVED
        ? TechTimeCorrectionStatus.APPROVED
        : TechTimeCorrectionStatus.REJECTED;

    const updated = await prisma.$transaction(async (tx) => {
      const c = await tx.techTimeCorrection.update({
        where: { id: correctionId },
        data: {
          status: nextStatus,
          reviewedById: user.id,
          reviewNote: body.reviewNote ? String(body.reviewNote) : null,
        },
      });
      if (nextStatus === TechTimeCorrectionStatus.APPROVED) {
        await tx.techTimeSegment.update({
          where: { id: correction.segmentId },
          data: {
            ...(correction.requestedStart ? { startedAt: correction.requestedStart } : {}),
            ...(correction.requestedEnd !== undefined
              ? { endedAt: correction.requestedEnd }
              : {}),
            ...(correction.requestedCategory
              ? { category: correction.requestedCategory }
              : {}),
          },
        });
      }
      return c;
    });

    return NextResponse.json({ correction: updated });
  } catch {
    return unauthorizedResponse();
  }
}
