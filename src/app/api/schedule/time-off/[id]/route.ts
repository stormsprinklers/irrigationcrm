import { NextRequest, NextResponse } from "next/server";
import { TimeOffStatus } from "@prisma/client";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { canManageTeamSchedule, canReviewTimeOff, serializeTimeOffRequest } from "@/lib/schedule/time-off";

type Params = { params: Promise<{ id: string }> };

const timeOffInclude = {
  user: { select: { name: true } },
  reviewedBy: { select: { name: true } },
  createdBy: { select: { name: true } },
} as const;

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const body = await request.json();
    const { status, reviewNotes } = body as {
      status?: TimeOffStatus;
      reviewNotes?: string;
    };

    const existing = await prisma.timeOffRequest.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const isSelf = existing.userId === user.id;

    if (status === TimeOffStatus.CANCELLED) {
      if (!isSelf && !canManageTeamSchedule(user.role)) return forbiddenResponse();
      if (existing.status !== TimeOffStatus.PENDING && !canManageTeamSchedule(user.role)) {
        return badRequestResponse("Only pending requests can be cancelled");
      }
    } else if (status === TimeOffStatus.APPROVED || status === TimeOffStatus.DENIED) {
      if (!canReviewTimeOff(user.role)) return forbiddenResponse();
      if (existing.status !== TimeOffStatus.PENDING) {
        return badRequestResponse("Only pending requests can be reviewed");
      }
    } else {
      return badRequestResponse("Invalid status update");
    }

    const updated = await prisma.timeOffRequest.update({
      where: { id },
      data: {
        status,
        reviewNotes: reviewNotes !== undefined ? String(reviewNotes) : existing.reviewNotes,
        reviewedById: status === TimeOffStatus.CANCELLED && isSelf ? null : user.id,
        reviewedAt: status === TimeOffStatus.CANCELLED && isSelf ? null : new Date(),
      },
      include: timeOffInclude,
    });

    return NextResponse.json(serializeTimeOffRequest(updated));
  } catch {
    return unauthorizedResponse();
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;

    const existing = await prisma.timeOffRequest.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (existing.userId !== user.id && !canManageTeamSchedule(user.role)) {
      return forbiddenResponse();
    }

    await prisma.timeOffRequest.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return unauthorizedResponse();
  }
}
