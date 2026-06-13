import { NextRequest, NextResponse } from "next/server";
import { TimeEventType, VisitStatus } from "@prisma/client";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { getVisitForCompany } from "@/lib/visits/queries";

type Params = { params: Promise<{ id: string }> };

const STATUS_MAP: Partial<Record<TimeEventType, VisitStatus>> = {
  EN_ROUTE: VisitStatus.EN_ROUTE,
  START: VisitStatus.IN_PROGRESS,
  PAUSE: VisitStatus.PAUSED,
  RESUME: VisitStatus.IN_PROGRESS,
  FINISH: VisitStatus.COMPLETED,
};

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const visit = await prisma.visit.findFirst({ where: { id, companyId: user.companyId } });
    if (!visit) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();
    const type = body.type as TimeEventType;
    if (!Object.values(TimeEventType).includes(type)) {
      return badRequestResponse("Invalid time event type");
    }

    await prisma.visitTimeEvent.create({
      data: { visitId: id, userId: user.id, type },
    });

    const newStatus = STATUS_MAP[type];
    if (newStatus) {
      await prisma.visit.update({ where: { id }, data: { status: newStatus } });
    }

    const updated = await getVisitForCompany(user.companyId, id);
    return NextResponse.json(updated);
  } catch {
    return unauthorizedResponse();
  }
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const events = await prisma.visitTimeEvent.findMany({
      where: { visit: { id, companyId: user.companyId } },
      orderBy: { occurredAt: "asc" },
      include: { user: { select: { id: true, name: true } } },
    });
    return NextResponse.json(events);
  } catch {
    return unauthorizedResponse();
  }
}
