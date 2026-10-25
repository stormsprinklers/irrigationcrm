import { holidayVisitPlan } from "@/lib/holiday-lighting/visit-plan";
import { isHolidayLightingCompany } from "@/lib/company/industry";
import { NextRequest, NextResponse } from "next/server";
import { Division, VisitStatus } from "@prisma/client";
import { addHours } from "date-fns";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { computeDeferredVisitDeposit } from "@/lib/estimates/deferred-visit-deposit";
import { prisma } from "@/lib/prisma";
import { resolveServiceAreaByZip } from "@/lib/service-areas";
import { validateScheduledVisitAssignment } from "@/lib/schedule/visit-assignment";
import { toNumber } from "@/lib/visits/totals";
import { defaultEstimateVisitTitle } from "@/lib/estimates/visit-title";
import { onVisitTimeChanged } from "@/lib/notifications/visit-events";
import { attachEstimateInvoicesToVisit } from "@/lib/estimates/attach-invoices-to-visit";

type Params = { params: Promise<{ id: string }> };

/**
 * After estimate signature approval: copy line items to today's visit,
 * or create/schedule a future visit (with optional deferred deposit).
 */
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
        company: {
          select: {
            deferredVisitDepositThreshold: true,
            deferredVisitDepositPercent: true,
          },
        },
      },
    });
    if (!estimate) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (!estimate.signatureBlobUrl && estimate.status !== "APPROVED") {
      return badRequestResponse("Estimate must be approved with a signature first");
    }
    if (estimate.status === "CONVERTED") {
      return badRequestResponse("This estimate was already converted to a visit");
    }

    const body = await request.json();
    const timing = body.timing as "today" | "another_day" | undefined;
    if (!timing || !["today", "another_day"].includes(timing)) {
      return badRequestResponse('timing must be "today" or "another_day"');
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

    const visitTotal =
      optionId && estimate.options.length
        ? toNumber(estimate.options.find((o) => o.id === optionId)?.total ?? estimate.total)
        : toNumber(estimate.total);

    let visitId: string;
    let depositDue = 0;
    const depositMeta = computeDeferredVisitDeposit(visitTotal, estimate.company);
    const defaultVisitTitle = defaultEstimateVisitTitle(estimate.designExportMetadata);

    if (timing === "today") {
      const linkedVisitId =
        (typeof body.visitId === "string" && body.visitId) || estimate.visitId || null;

      if (linkedVisitId) {
        const visit = await prisma.visit.findFirst({
          where: { id: linkedVisitId, companyId: user.companyId },
        });
        if (!visit) return NextResponse.json({ error: "Visit not found" }, { status: 404 });
        visitId = visit.id;
      } else {
        const created = await createScheduledVisitFromEstimate({
          companyId: user.companyId,
          estimate,
          title: defaultVisitTitle,
          startAt: new Date(),
          endAt: addHours(new Date(), 2),
          assignedUserId: user.id,
          division: Division.SERVICE,
        });
        if ("error" in created) return badRequestResponse(created.error);
        visitId = created.visitId;
      }
    } else {
      const schedule = body.schedule ?? {};
      const startAt = schedule.startAt ? new Date(schedule.startAt) : null;
      const endAt = schedule.endAt
        ? new Date(schedule.endAt)
        : startAt
          ? addHours(startAt, 2)
          : null;

      if (!startAt || Number.isNaN(startAt.getTime())) {
        return badRequestResponse("schedule.startAt is required for another_day");
      }
      if (!endAt || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
        return badRequestResponse("schedule.endAt must be after startAt");
      }

      const created = await createScheduledVisitFromEstimate({
        companyId: user.companyId,
        estimate,
        title:
          typeof schedule.title === "string" && schedule.title.trim()
            ? schedule.title.trim()
            : defaultVisitTitle,
        startAt,
        endAt,
        assignedUserId: schedule.assignedUserId ?? user.id,
        division: (schedule.division as Division) || Division.SERVICE,
        serviceAreaId: schedule.serviceAreaId,
        zip: schedule.zip,
        address: schedule.address,
        city: schedule.city,
        state: schedule.state,
        crewId: schedule.crewId,
      });
      if ("error" in created) return badRequestResponse(created.error);
      visitId = created.visitId;
      depositDue = depositMeta.depositDue;
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

    const holidayPlan = holidayVisitPlan(estimate.designExportMetadata, estimate.options.find(option => option.id === optionId)?.letter);
    if (holidayPlan) await prisma.visit.update({where: {id: visitId, companyId: user.companyId}, data: {designExportMetadata: holidayPlan, division: "HOLIDAY_LIGHTS"}});
    await prisma.estimate.update({
      where: { id: estimate.id },
      data: {
        visitId,
        status: "CONVERTED",
        needsScheduling: false,
        ...(optionId ? { selectedOptionId: optionId } : {}),
      },
    });
    await attachEstimateInvoicesToVisit({
      companyId: user.companyId,
      estimateId: estimate.id,
      visitId,
    });

    if (timing === "another_day" && body.notifyCustomer !== false) {
      void onVisitTimeChanged({
        visitId,
        companyId: user.companyId,
        isInitialSchedule: true,
      }).catch(() => {});
    }

    return NextResponse.json({
      visitId,
      estimateId: estimate.id,
      timing,
      visitTotal,
      depositDue,
      depositRequired: depositDue > 0,
      depositThreshold: depositMeta.threshold,
      depositPercent: depositMeta.percent,
    });
  } catch {
    return unauthorizedResponse();
  }
}

async function createScheduledVisitFromEstimate(params: {
  companyId: string;
  estimate: {
    id: string;
    customerId: string;
    propertyId: string | null;
    customer: {
      zip: string | null;
      address: string | null;
      city: string | null;
      state: string | null;
    };
    property: {
      zip: string | null;
      address: string | null;
      city: string | null;
      state: string | null;
    } | null;
  };
  title: string;
  startAt: Date;
  endAt: Date;
  assignedUserId: string | null;
  division: Division;
  serviceAreaId?: string | null;
  zip?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  crewId?: string | null;
}): Promise<{ visitId: string } | { error: string }> {
  const zip =
    params.zip ?? params.estimate.property?.zip ?? params.estimate.customer.zip ?? null;

  let serviceAreaId = params.serviceAreaId ?? null;
  if (!serviceAreaId && zip) {
    const area = await resolveServiceAreaByZip(params.companyId, String(zip));
    serviceAreaId = area?.id ?? null;
  }
  if (!serviceAreaId) {
    const fallback = await prisma.serviceArea.findFirst({
      where: { companyId: params.companyId },
      orderBy: { createdAt: "asc" },
    });
    serviceAreaId = fallback?.id ?? null;
  }
  // serviceAreaId is optional — create the visit even when no service area is configured.

  const assignmentError = validateScheduledVisitAssignment(
    VisitStatus.SCHEDULED,
    params.assignedUserId
  );
  if (assignmentError) return { error: assignmentError };

  const holiday = isHolidayLightingCompany(await prisma.company.findUnique({where: {id: params.companyId}}));
  const plan = await prisma.estimate.findFirst({where: {id: params.estimate.id, companyId: params.companyId}, select: {designExportMetadata: true}});
  const visit = await prisma.visit.create({
    data: {
      companyId: params.companyId,
      estimateId: params.estimate.id,
      customerId: params.estimate.customerId,
      propertyId: params.estimate.propertyId,
      title: holiday && ["Service appointment", "Install", "Service visit"].includes(params.title) ? "Holiday lighting appointment" : params.title,
      startAt: params.startAt,
      endAt: params.endAt,
      division: holiday ? Division.HOLIDAY_LIGHTS : params.division,
      designExportMetadata: plan?.designExportMetadata ?? undefined,
      serviceAreaId,
      assignedUserId: params.assignedUserId,
      crewId: params.crewId ?? null,
      address:
        params.address ??
        params.estimate.property?.address ??
        params.estimate.customer.address,
      city: params.city ?? params.estimate.property?.city ?? params.estimate.customer.city,
      state: params.state ?? params.estimate.property?.state ?? params.estimate.customer.state,
      zip,
      status: VisitStatus.SCHEDULED,
    },
  });

  return { visitId: visit.id };
}
