import { NextResponse } from "next/server";
import {
  requirePortalCustomer,
  portalForbiddenResponse,
  portalUnauthorizedResponse,
} from "@/lib/portal/auth";
import { getPortalAvailableSlots } from "@/lib/portal/scheduling";

export async function GET() {
  const ctx = await requirePortalCustomer();
  if (!ctx) return portalUnauthorizedResponse();
  if (!ctx.company.portalAllowSchedule) {
    return portalForbiddenResponse("Scheduling is not available in the portal");
  }

  const slots = await getPortalAvailableSlots(ctx.company);
  return NextResponse.json({ slots });
}
