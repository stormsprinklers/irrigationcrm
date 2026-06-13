import { NextRequest, NextResponse } from "next/server";
import { Division, VisitStatus } from "@prisma/client";
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
    const existing = await prisma.visit.findFirst({ where: { id, companyId: user.companyId } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();
    let serviceAreaId = body.serviceAreaId ?? existing.serviceAreaId;
    if (!body.serviceAreaId && body.zip) {
      const area = await resolveServiceAreaByZip(user.companyId, String(body.zip));
      if (area) serviceAreaId = area.id;
    }

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
      },
      include: jobInclude,
    });

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
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return unauthorizedResponse();
    return NextResponse.json({ error: "Failed to cancel visit" }, { status: 500 });
  }
}
