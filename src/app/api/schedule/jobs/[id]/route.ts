import { NextRequest, NextResponse } from "next/server";
import { Division, VisitStatus } from "@prisma/client";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getCustomerServiceBlock } from "@/lib/customers/service-guard";
import { prisma } from "@/lib/prisma";
import { resolveServiceAreaByZip } from "@/lib/service-areas";
import { clearNeedsSchedulingForVisit } from "@/lib/estimates/scheduling";
import { onVisitCancelled, onVisitTimeChanged } from "@/lib/notifications/visit-events";
import { jobInclude, serializeJob } from "@/lib/schedule/queries";
import { validateAssignmentUpdate } from "@/lib/schedule/time-off";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (user.role === "TECH") return forbiddenResponse();

    const { id } = await params;
    const existing = await prisma.visit.findFirst({ where: { id, companyId: user.companyId } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();
    const nextCustomerId =
      body.customerId !== undefined ? (body.customerId as string | null) : existing.customerId;
    if (nextCustomerId) {
      const block = await getCustomerServiceBlock(user.companyId, nextCustomerId);
      if (block) return badRequestResponse(block);
    }

    let serviceAreaId = body.serviceAreaId ?? existing.serviceAreaId;
    if (!body.serviceAreaId && body.zip) {
      const area = await resolveServiceAreaByZip(user.companyId, String(body.zip));
      if (area) serviceAreaId = area.id;
    }

    const nextStart = body.startAt !== undefined ? new Date(body.startAt) : existing.startAt;
    const nextEnd = body.endAt !== undefined ? new Date(body.endAt) : existing.endAt;
    const nextAssignedUserId =
      body.assignedUserId !== undefined ? (body.assignedUserId as string | null) : existing.assignedUserId;

    const availabilityError = await validateAssignmentUpdate(
      user.companyId,
      nextAssignedUserId,
      nextStart,
      nextEnd,
      id
    );
    if (availabilityError) return badRequestResponse(availabilityError);

    const visit = await prisma.visit.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: String(body.title) } : {}),
        ...(body.startAt !== undefined ? { startAt: new Date(body.startAt) } : {}),
        ...(body.endAt !== undefined ? { endAt: new Date(body.endAt) } : {}),
        ...(body.division !== undefined ? { division: body.division as Division } : {}),
        ...(body.status !== undefined ? { status: body.status as VisitStatus } : {}),
        ...(body.propertyId !== undefined ? { propertyId: body.propertyId ?? null } : {}),
        ...(body.customerId !== undefined ? { customerId: body.customerId ?? null } : {}),
        ...(body.tags !== undefined ? { tags: Array.isArray(body.tags) ? body.tags : [] } : {}),
        serviceAreaId,
        ...(body.assignedUserId !== undefined ? { assignedUserId: body.assignedUserId ?? null } : {}),
        ...(body.crewId !== undefined ? { crewId: body.crewId ?? null } : {}),
        ...(body.address !== undefined ? { address: body.address ?? null } : {}),
        ...(body.city !== undefined ? { city: body.city ?? null } : {}),
        ...(body.state !== undefined ? { state: body.state ?? null } : {}),
        ...(body.zip !== undefined ? { zip: body.zip ?? null } : {}),
        ...(body.installDurationDays !== undefined
          ? { installDurationDays: Math.max(1, Number(body.installDurationDays) || 4) }
          : {}),
      },
      include: jobInclude,
    });

    await clearNeedsSchedulingForVisit(id);

    const startChanged =
      body.startAt !== undefined &&
      new Date(body.startAt).getTime() !== existing.startAt.getTime();
    const cancelled =
      body.status === VisitStatus.CANCELLED && existing.status !== VisitStatus.CANCELLED;

    if (cancelled && existing.customerId) {
      void onVisitCancelled(id, user.companyId).catch(() => {});
    } else if (startChanged && existing.customerId && visit.status !== VisitStatus.CANCELLED) {
      void onVisitTimeChanged({ visitId: id, companyId: user.companyId }).catch(() => {});
    }

    return NextResponse.json(serializeJob(visit));
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return unauthorizedResponse();
    return NextResponse.json({ error: "Failed to update visit" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (user.role === "TECH") return forbiddenResponse();

    const { id } = await params;
    const existing = await prisma.visit.findFirst({ where: { id, companyId: user.companyId } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.visit.update({ where: { id }, data: { status: VisitStatus.CANCELLED } });
    if (existing.customerId) {
      void onVisitCancelled(id, user.companyId).catch(() => {});
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return unauthorizedResponse();
    return NextResponse.json({ error: "Failed to cancel visit" }, { status: 500 });
  }
}
