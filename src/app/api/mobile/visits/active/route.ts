import { NextResponse } from "next/server";
import { VisitStatus } from "@prisma/client";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { serializeVisitDetail } from "@/lib/visits/queries";

const ACTIVE_STATUSES: VisitStatus[] = [
  VisitStatus.EN_ROUTE,
  VisitStatus.IN_PROGRESS,
  VisitStatus.PAUSED,
];

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser(request);
    const visit = await prisma.visit.findFirst({
      where: {
        companyId: user.companyId,
        assignedUserId: user.id,
        status: { in: ACTIVE_STATUSES },
      },
      orderBy: { updatedAt: "desc" },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            address: true,
            city: true,
            state: true,
            zip: true,
            doNotService: true,
          },
        },
        property: {
          select: {
            id: true,
            name: true,
            address: true,
            city: true,
            state: true,
            zip: true,
            latitude: true,
            longitude: true,
            aerialImageUrl: true,
            propertyDiagramUrl: true,
            irrigationMapStatus: true,
          },
        },
        serviceArea: { select: { id: true, name: true, color: true } },
        assignedUser: { select: { id: true, name: true, color: true, photoUrl: true } },
        crew: { select: { id: true, name: true, color: true } },
        lineItems: true,
        discounts: true,
        timeEvents: {
          orderBy: { occurredAt: "asc" },
          include: { user: { select: { id: true, name: true } } },
        },
        notes: {
          orderBy: { createdAt: "desc" },
          include: { author: { select: { id: true, name: true, photoUrl: true, color: true } } },
        },
        attachments: {
          orderBy: { createdAt: "desc" },
          include: { uploadedBy: { select: { id: true, name: true } } },
        },
        estimates: { select: { id: true, status: true, total: true, createdAt: true } },
        invoices: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            invoiceNumber: true,
            status: true,
            total: true,
            paidAt: true,
            publicToken: true,
            payments: { select: { amount: true, refundedAt: true } },
          },
        },
      },
    });

    if (!visit) {
      return NextResponse.json({ visit: null });
    }

    return NextResponse.json({ visit: await serializeVisitDetail(visit) });
  } catch {
    return unauthorizedResponse();
  }
}
