import { NextResponse } from "next/server";
import {
  requirePortalCustomer,
  portalForbiddenResponse,
  portalNotFoundResponse,
  portalUnauthorizedResponse,
} from "@/lib/portal/auth";
import { portalFeatureEnabled } from "@/lib/portal/permissions";
import { getCustomerVisit } from "@/lib/portal/scheduling";
import { serializePortalVisit } from "@/lib/portal/serializers";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const ctx = await requirePortalCustomer();
  if (!ctx) return portalUnauthorizedResponse();
  if (!portalFeatureEnabled(ctx.company, "jobs")) {
    return portalForbiddenResponse("Visits are not available in the portal");
  }

  const { id } = await params;
  const visit = await getCustomerVisit(ctx.companyId, ctx.customerId, id);
  if (!visit) return portalNotFoundResponse();

  // Internal visit notes are never exposed to portal customers (see serializePortalVisit).
  return NextResponse.json({
    visit: serializePortalVisit(visit),
    policies: {
      rescheduleLeadHours: ctx.company.portalRescheduleLeadHours,
      cancelLeadHours: ctx.company.portalCancelLeadHours,
    },
  });
}
