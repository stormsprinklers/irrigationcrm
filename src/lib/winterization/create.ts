import { Prisma, WinterizationRequestStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/inbox/phone";
import { createLeadFromIntegration } from "@/lib/leads/create";
import { listWinterizationWeeks, parseIsoDate, winterizationSeasonYear } from "@/lib/winterization/weeks";

export type WinterizationIntake = {
  externalId: string;
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  zoneCount: number;
  quotedPrice: number;
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
  schedulingNotes?: string | null;
  shutoffValveLocation?: string | null;
  timerLocation?: string | null;
  source?: string | null;
};

export async function createWinterizationRequest(companyId: string, input: WinterizationIntake) {
  const weeks = listWinterizationWeeks();
  const week = weeks.find((item) => item.startDate === input.weekStart && item.endDate === input.weekEnd);
  if (!week) {
    throw new Error("Selected week is not available");
  }

  const existing = input.externalId
    ? await prisma.winterizationRequest.findFirst({
        where: { companyId, externalId: input.externalId },
      })
    : null;
  if (existing) return { request: existing, created: false };

  const notes = [
    `Winterization week: ${week.label}`,
    `Zones: ${input.zoneCount}`,
    `Quoted: $${input.quotedPrice}`,
    input.schedulingNotes ? `Scheduling notes: ${input.schedulingNotes}` : null,
    input.shutoffValveLocation ? `Shutoff valve: ${input.shutoffValveLocation}` : null,
    input.timerLocation ? `Timer: ${input.timerLocation}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const { lead } = await createLeadFromIntegration(companyId, {
    externalId: input.externalId,
    name: input.name,
    phone: input.phone,
    email: input.email,
    source: input.source || "winterization-booking",
    notes,
    address: input.address,
    city: input.city,
    metadata: {
      winterization: true,
      zoneCount: input.zoneCount,
      quotedPrice: input.quotedPrice,
      weekLabel: week.label,
    },
  });

  const phone = input.phone ? normalizePhone(input.phone) : "";
  const email = input.email?.trim().toLowerCase() || "";
  let customer =
    phone || email
      ? await prisma.customer.findFirst({
          where: {
            companyId,
            OR: [...(phone ? [{ phone }] : []), ...(email ? [{ email }] : [])],
          },
        })
      : null;

  if (!customer && (phone || email || input.name)) {
    customer = await prisma.customer.create({
      data: {
        companyId,
        name: input.name,
        phone: phone || null,
        email: email || null,
        address: input.address ?? null,
        city: input.city ?? null,
        state: input.state ?? "UT",
        zip: input.zip ?? null,
        leadSource: "Winterization booking",
      },
    });
  } else if (customer && !customer.doNotService) {
    customer = await prisma.customer.update({
      where: { id: customer.id },
      data: {
        ...(input.address ? { address: input.address } : {}),
        ...(input.city ? { city: input.city } : {}),
        ...(input.zip ? { zip: input.zip } : {}),
      },
    });
  }

  const request = await prisma.winterizationRequest.create({
    data: {
      companyId,
      customerId: customer?.doNotService ? null : customer?.id ?? null,
      leadId: lead.id,
      status: WinterizationRequestStatus.NEED_BOOKING,
      seasonYear: winterizationSeasonYear(),
      weekStart: parseIsoDate(week.startDate),
      weekEnd: parseIsoDate(week.endDate),
      weekLabel: week.label,
      zoneCount: input.zoneCount,
      quotedPrice: new Prisma.Decimal(input.quotedPrice),
      name: input.name,
      phone: phone || input.phone || null,
      email: email || null,
      address: input.address ?? null,
      city: input.city ?? null,
      state: input.state ?? "UT",
      zip: input.zip ?? null,
      schedulingNotes: input.schedulingNotes || null,
      shutoffValveLocation: input.shutoffValveLocation || null,
      timerLocation: input.timerLocation || null,
      source: input.source || "website",
      externalId: input.externalId,
    },
  });

  return { request, created: true };
}
