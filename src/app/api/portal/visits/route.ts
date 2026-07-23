import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requirePortalCustomer,
  portalForbiddenResponse,
  portalUnauthorizedResponse,
} from "@/lib/portal/auth";
import { portalFeatureEnabled } from "@/lib/portal/permissions";
import { serializePortalVisit } from "@/lib/portal/serializers";

export async function GET() {
  const ctx = await requirePortalCustomer();
  if (!ctx) return portalUnauthorizedResponse();
  if (!portalFeatureEnabled(ctx.company, "jobs")) {
    return portalForbiddenResponse("Visits are not available in the portal");
  }

  const visits = await prisma.visit.findMany({
    where: { companyId: ctx.companyId, customerId: ctx.customerId },
    include: {
      assignedUser: { select: { name: true, photoUrl: true, title: true } },
      property: {
        select: { id: true, name: true, address: true, city: true, state: true, zip: true },
      },
    },
    orderBy: { startAt: "desc" },
    take: 200,
  });

  const now = Date.now();
  const upcoming = visits
    .filter((v) => v.startAt && v.startAt.getTime() >= now && v.status !== "CANCELLED")
    .sort((a, b) => (a.startAt!.getTime() - b.startAt!.getTime()))
    .map(serializePortalVisit);
  const past = visits
    .filter((v) => !v.startAt || v.startAt.getTime() < now || v.status === "COMPLETED" || v.status === "CANCELLED")
    .map(serializePortalVisit);

  return NextResponse.json({ upcoming, past });
}
