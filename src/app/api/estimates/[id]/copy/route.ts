import { NextRequest, NextResponse } from "next/server";
import { Division, VisitStatus } from "@prisma/client";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { resolveServiceAreaByZip } from "@/lib/service-areas";
import { validateScheduledVisitAssignment } from "@/lib/schedule/visit-assignment";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();

    const { id } = await params;
    const estimate = await prisma.estimate.findFirst({
      where: { id, companyId: user.companyId },
      include: {
        lineItems: true,
        discounts: true,
        options: { orderBy: { sortOrder: "asc" } },
        customer: true,
        property: true,
      },
    });
    if (!estimate) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();
    const target = body.target as "this_visit" | "new_visit" | undefined;
    if (!target || !["this_visit", "new_visit"].includes(target)) {
      return badRequestResponse('target must be "this_visit" or "new_visit"');
    }

    const optionId =
      (typeof body.optionId === "string" && body.optionId) ||
      estimate.selectedOptionId ||
      estimate.options[0]?.id;

    const lineItems = optionId
      ? estimate.lineItems.filter((item) => item.optionId === optionId || !item.optionId)
      : estimate.lineItems;
    const discounts = optionId
      ? estimate.discounts.filter((d) => d.optionId === optionId || !d.optionId)
      : estimate.discounts;

    let visitId: string;

    if (target === "this_visit") {
      if (!body.visitId) return badRequestResponse("visitId is required for this_visit");
      const visit = await prisma.visit.findFirst({
        where: { id: body.visitId, companyId: user.companyId },
      });
      if (!visit) return NextResponse.json({ error: "Visit not found" }, { status: 404 });
      visitId = visit.id;
    } else {
      const schedule = body.schedule ?? {};
      if (!schedule.title || !schedule.startAt || !schedule.endAt || !schedule.division) {
        return badRequestResponse("schedule.title, startAt, endAt, and division are required for new_visit");
      }

      let serviceAreaId = schedule.serviceAreaId;
      if (!serviceAreaId && (schedule.zip || estimate.property?.zip || estimate.customer.zip)) {
        const zip = schedule.zip ?? estimate.property?.zip ?? estimate.customer.zip;
        const area = await resolveServiceAreaByZip(user.companyId, String(zip));
        serviceAreaId = area?.id;
      }
      if (!serviceAreaId) return badRequestResponse("serviceAreaId or valid zip is required");

      const assignmentError = validateScheduledVisitAssignment(
        VisitStatus.SCHEDULED,
        schedule.assignedUserId
      );
      if (assignmentError) return badRequestResponse(assignmentError);

      const visit = await prisma.visit.create({
        data: {
          companyId: user.companyId,
          customerId: estimate.customerId,
          propertyId: estimate.propertyId,
          title: String(schedule.title),
          startAt: new Date(schedule.startAt),
          endAt: new Date(schedule.endAt),
          division: schedule.division as Division,
          serviceAreaId,
          assignedUserId: schedule.assignedUserId ?? null,
          crewId: schedule.crewId ?? null,
          address: schedule.address ?? estimate.property?.address ?? estimate.customer.address,
          city: schedule.city ?? estimate.property?.city ?? estimate.customer.city,
          state: schedule.state ?? estimate.property?.state ?? estimate.customer.state,
          zip: schedule.zip ?? estimate.property?.zip ?? estimate.customer.zip,
          status: VisitStatus.SCHEDULED,
        },
      });
      visitId = visit.id;
    }

    await prisma.visitLineItem.deleteMany({ where: { visitId } });
    await prisma.discount.deleteMany({ where: { visitId } });

    if (lineItems.length) {
      await prisma.visitLineItem.createMany({
        data: lineItems.map((item, index) => ({
          visitId,
          priceBookItemId: item.priceBookItemId,
          name: item.name,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total,
          sortOrder: index,
        })),
      });
    }

    if (discounts.length) {
      await prisma.discount.createMany({
        data: discounts.map((d) => ({
          visitId,
          label: d.label,
          type: d.type,
          amount: d.amount,
        })),
      });
    }

    await prisma.estimate.update({
      where: { id: estimate.id },
      data: {
        visitId,
        status: "CONVERTED",
        ...(optionId ? { selectedOptionId: optionId } : {}),
      },
    });

    return NextResponse.json({ visitId, estimateId: estimate.id });
  } catch {
    return unauthorizedResponse();
  }
}
