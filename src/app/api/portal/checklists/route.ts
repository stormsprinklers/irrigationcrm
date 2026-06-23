import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requirePortalCustomer,
  portalForbiddenResponse,
  portalUnauthorizedResponse,
} from "@/lib/portal/auth";
import { portalFeatureEnabled } from "@/lib/portal/permissions";

const CUSTOMER_VISIBLE_ITEM_TYPES = new Set([
  "CHECKBOX",
  "SELECT_ONE",
  "MULTI_SELECT",
  "NUMBER",
  "MEDIA",
]);

export async function GET(request: NextRequest) {
  const ctx = await requirePortalCustomer();
  if (!ctx) return portalUnauthorizedResponse();
  if (!portalFeatureEnabled(ctx.company, "checklists")) {
    return portalForbiddenResponse("Checklists are not available in the portal");
  }

  const visitId = request.nextUrl.searchParams.get("visitId");
  if (!visitId) {
    return NextResponse.json({ error: "visitId is required" }, { status: 400 });
  }

  const visit = await prisma.visit.findFirst({
    where: { id: visitId, companyId: ctx.companyId, customerId: ctx.customerId },
    select: { id: true },
  });
  if (!visit) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const checklists = await prisma.visitChecklist.findMany({
    where: {
      visitId,
      status: "COMPLETED",
      template: { customerVisible: true },
    },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      template: { select: { customerVisible: true } },
    },
    orderBy: { completedAt: "desc" },
  });

  return NextResponse.json({
    checklists: checklists.map((cl) => ({
      id: cl.id,
      name: cl.name,
      completedAt: cl.completedAt?.toISOString() ?? null,
      items: cl.items
        .filter((item) => CUSTOMER_VISIBLE_ITEM_TYPES.has(item.type))
        .map((item) => ({
          label: item.label,
          type: item.type,
          response: item.response,
          completedAt: item.completedAt?.toISOString() ?? null,
        })),
    })),
  });
}
