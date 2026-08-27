import { NextRequest, NextResponse } from "next/server";
import { createOnlineBooking, getPublicOnlineBookingOffer, OnlineBookingError } from "@/lib/booking/create";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ slug: string }> };

async function getCompanyIdBySlug(slug: string) {
  const company = await prisma.company.findFirst({
    where: { bookingSlug: slug, onlineBookingEnabled: true },
    select: { id: true },
  });
  return company?.id ?? null;
}

export async function GET(_request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const companyId = await getCompanyIdBySlug(slug);
  if (!companyId) {
    return NextResponse.json({ error: "Booking not available" }, { status: 404 });
  }

  const offer = await getPublicOnlineBookingOffer(companyId);
  if (!offer) {
    return NextResponse.json({ error: "Booking not available" }, { status: 404 });
  }

  return NextResponse.json(offer);
}

export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const companyId = await getCompanyIdBySlug(slug);
  if (!companyId) {
    return NextResponse.json({ error: "Booking not available" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const result = await createOnlineBooking(companyId, {
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
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof OnlineBookingError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[book/public] failed", err);
    return NextResponse.json({ error: "Booking failed" }, { status: 500 });
  }
}
