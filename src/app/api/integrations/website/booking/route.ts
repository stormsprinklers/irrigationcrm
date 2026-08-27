import { NextRequest, NextResponse } from "next/server";
import { IntegrationType } from "@prisma/client";
import { authenticateIntegration, isIntegrationContext } from "@/lib/integrations/auth";
import { logIntegrationAudit } from "@/lib/integrations/audit";
import { createOnlineBooking, getPublicOnlineBookingOffer, OnlineBookingError } from "@/lib/booking/create";

export async function GET(request: NextRequest) {
  const auth = await authenticateIntegration(request, IntegrationType.WEBSITE);
  if (!isIntegrationContext(auth)) return auth;

  const offer = await getPublicOnlineBookingOffer(auth.companyId);
  if (!offer) {
    return NextResponse.json({ error: "Booking not available" }, { status: 404 });
  }

  return NextResponse.json(offer);
}

export async function POST(request: NextRequest) {
  const auth = await authenticateIntegration(request, IntegrationType.WEBSITE);
  if (!isIntegrationContext(auth)) return auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const result = await createOnlineBooking(auth.companyId, {
      name: String(body.name ?? ""),
      phone: String(body.phone ?? ""),
      email: body.email ? String(body.email) : null,
      address: body.address ? String(body.address) : null,
      city: body.city ? String(body.city) : null,
      state: body.state ? String(body.state) : null,
      zip: body.zip ? String(body.zip) : null,
      startAt: String(body.startAt ?? ""),
      endAt: String(body.endAt ?? ""),
      notes: body.notes ? String(body.notes) : null,
    });
    await logIntegrationAudit({
      companyId: auth.companyId,
      integrationType: IntegrationType.WEBSITE,
      action: "website.booking.create",
      payload: { visitId: result.visitId },
      status: "success",
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Booking failed";
    const status = err instanceof OnlineBookingError ? err.status : 500;
    await logIntegrationAudit({
      companyId: auth.companyId,
      integrationType: IntegrationType.WEBSITE,
      action: "website.booking.create",
      payload: body,
      status: "error",
      error: message,
    });
    return NextResponse.json({ error: message }, { status });
  }
}
