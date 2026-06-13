import { NextRequest, NextResponse } from "next/server";
import { Division, JobStatus } from "@prisma/client";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { resolveServiceAreaByZip } from "@/lib/service-areas";
import { jobInclude, serializeJob } from "@/lib/schedule/queries";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (user.role === "TECH") return forbiddenResponse();

    const { id } = await params;
    const existing = await prisma.scheduledJob.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();
    let serviceAreaId = body.serviceAreaId ?? existing.serviceAreaId;

    if (!body.serviceAreaId && body.zip) {
      const area = await resolveServiceAreaByZip(user.companyId, String(body.zip));
      if (area) serviceAreaId = area.id;
    }

    const job = await prisma.scheduledJob.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: String(body.title) } : {}),
        ...(body.startAt !== undefined ? { startAt: new Date(body.startAt) } : {}),
        ...(body.endAt !== undefined ? { endAt: new Date(body.endAt) } : {}),
        ...(body.division !== undefined ? { division: body.division as Division } : {}),
        ...(body.status !== undefined ? { status: body.status as JobStatus } : {}),
        serviceAreaId,
        ...(body.assignedUserId !== undefined ? { assignedUserId: body.assignedUserId ?? null } : {}),
        ...(body.crewId !== undefined ? { crewId: body.crewId ?? null } : {}),
        ...(body.customerId !== undefined ? { customerId: body.customerId ?? null } : {}),
        ...(body.notes !== undefined ? { notes: body.notes ?? null } : {}),
        ...(body.address !== undefined ? { address: body.address ?? null } : {}),
        ...(body.city !== undefined ? { city: body.city ?? null } : {}),
        ...(body.state !== undefined ? { state: body.state ?? null } : {}),
        ...(body.zip !== undefined ? { zip: body.zip ?? null } : {}),
        ...(body.estimatedValue !== undefined ? { estimatedValue: body.estimatedValue ?? null } : {}),
      },
      include: jobInclude,
    });

    return NextResponse.json(serializeJob(job));
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    return NextResponse.json({ error: "Failed to update job" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (user.role === "TECH") return forbiddenResponse();

    const { id } = await params;
    const existing = await prisma.scheduledJob.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.scheduledJob.update({
      where: { id },
      data: { status: JobStatus.CANCELLED },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    return NextResponse.json({ error: "Failed to cancel job" }, { status: 500 });
  }
}
