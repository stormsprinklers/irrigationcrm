import { NextRequest, NextResponse } from "next/server";
import { WinterizationRequestStatus } from "@prisma/client";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { irrigationFeaturesEnabled } from "@/lib/company/features";
import { canViewWinterizationNav } from "@/lib/settings/access";
import {
  isIsoDay,
  removeWinterizationRequests,
  scheduleWinterizationRequests,
} from "@/lib/winterization/actions";

const STATUSES = new Set<string>(Object.values(WinterizationRequestStatus));

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireSessionUser();
    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: { irrigationFeaturesEnabled: true },
    });
    if (!irrigationFeaturesEnabled(company) || !canViewWinterizationNav(user.role)) {
      return NextResponse.json({ error: "Winterization tools are off" }, { status: 403 });
    }

    const { id } = await context.params;
    const body = await request.json();
    const status = String(body.status ?? "");
    const scheduledDate =
      typeof body.scheduledDate === "string" ? body.scheduledDate.trim() : "";

    const existing = await prisma.winterizationRequest.findFirst({
      where: { id, companyId: user.companyId },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (status === WinterizationRequestStatus.CANCELLED) {
      const result = await removeWinterizationRequests(user.companyId, [id]);
      return NextResponse.json({ id, status: "CANCELLED", updated: result.updated });
    }

    if (status === WinterizationRequestStatus.SCHEDULED || scheduledDate) {
      if (scheduledDate && !isIsoDay(scheduledDate)) {
        return NextResponse.json({ error: "Choose a valid date" }, { status: 400 });
      }
      if (!scheduledDate) {
        return NextResponse.json({ error: "Choose a date to schedule" }, { status: 400 });
      }
      const result = await scheduleWinterizationRequests(user.companyId, [id], scheduledDate);
      return NextResponse.json({ id, status: "SCHEDULED", updated: result.updated });
    }

    if (!STATUSES.has(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const updated = await prisma.winterizationRequest.update({
      where: { id },
      data: { status: status as WinterizationRequestStatus },
    });
    return NextResponse.json({ id: updated.id, status: updated.status });
  } catch {
    return unauthorizedResponse();
  }
}
