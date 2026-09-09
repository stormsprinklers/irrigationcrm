import { Prisma, WinterizationRequestStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/inbox/phone";
import { createLeadFromIntegration } from "@/lib/leads/create";
import { applyWinterizationSeasonTag } from "@/lib/winterization/tags";
import {
  listWinterizationWeeks,
  parseIsoDate,
  winterizationSeasonTag,
  winterizationSeasonYear,
} from "@/lib/winterization/weeks";

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
  if (existing) {
    await applyWinterizationSeasonTag(existing.customerId, existing.seasonYear);
    return { request: existing, created: false };
  }

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
        tags: [winterizationSeasonTag()],
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

  const seasonYear = winterizationSeasonYear();
  const customerId = customer?.doNotService ? null : customer?.id ?? null;
  const request = await prisma.winterizationRequest.create({
    data: {
      companyId,
      customerId,
      leadId: lead.id,
      status: WinterizationRequestStatus.NEED_BOOKING,
      seasonYear,
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

  await applyWinterizationSeasonTag(customerId, seasonYear);

  return { request, created: true };
}

export class WinterizationDuplicateError extends Error {
  constructor() {
    super("This customer is already on the winterization list for this season");
    this.name = "WinterizationDuplicateError";
  }
}

export type CrmWinterizationAdd = {
  customerId?: string | null;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  weekStart?: string | null;
  zoneCount?: number | null;
  schedulingNotes?: string | null;
};

export async function addCrmWinterizationRequest(companyId: string, input: CrmWinterizationAdd) {
  const seasonYear = winterizationSeasonYear();
  const weeks = listWinterizationWeeks();
  const weekStart = input.weekStart?.trim() || "";
  const week = weekStart ? weeks.find((item) => item.startDate === weekStart) : null;
  if (weekStart && !week) {
    throw new Error("Selected week is not available");
  }

  let customer = input.customerId
    ? await prisma.customer.findFirst({
        where: { id: input.customerId, companyId },
      })
    : null;
  if (input.customerId && !customer) {
    throw new Error("Customer not found");
  }
  if (customer?.doNotService) {
    throw new Error("This customer is marked do not service");
  }

  const phone = (input.phone || customer?.phone || "").trim()
    ? normalizePhone(input.phone || customer?.phone || "")
    : "";
  const email = (input.email || customer?.email || "").trim().toLowerCase();
  const name = (input.name || customer?.name || "").trim();

  if (!customer && (phone || email)) {
    customer = await prisma.customer.findFirst({
      where: {
        companyId,
        OR: [...(phone ? [{ phone }] : []), ...(email ? [{ email }] : [])],
      },
    });
    if (customer?.doNotService) {
      throw new Error("This customer is marked do not service");
    }
  }

  if (!customer) {
    if (!name) {
      throw new Error("Select a customer or enter a name");
    }
    customer = await prisma.customer.create({
      data: {
        companyId,
        name,
        phone: phone || null,
        email: email || null,
        address: input.address?.trim() || null,
        city: input.city?.trim() || null,
        state: input.state?.trim() || "UT",
        zip: input.zip?.trim() || null,
        leadSource: "Winterization list",
        tags: [winterizationSeasonTag(seasonYear)],
      },
    });
  }

  const existing = await prisma.winterizationRequest.findFirst({
    where: {
      companyId,
      seasonYear,
      status: { in: [WinterizationRequestStatus.NEED_BOOKING, WinterizationRequestStatus.SCHEDULED] },
      OR: [
        { customerId: customer.id },
        ...(phone ? [{ phone }] : []),
        ...(email ? [{ email }] : []),
      ],
    },
  });
  if (existing) {
    await applyWinterizationSeasonTag(existing.customerId ?? customer.id, seasonYear);
    throw new WinterizationDuplicateError();
  }

  const request = await prisma.winterizationRequest.create({
    data: {
      companyId,
      customerId: customer.id,
      status: WinterizationRequestStatus.NEED_BOOKING,
      seasonYear,
      weekStart: week ? parseIsoDate(week.startDate) : parseIsoDate(`${seasonYear}-01-01`),
      weekEnd: week ? parseIsoDate(week.endDate) : parseIsoDate(`${seasonYear}-01-01`),
      weekLabel: week?.label ?? "No week yet",
      zoneCount: input.zoneCount ?? null,
      name: name || customer.name,
      phone: phone || customer.phone || null,
      email: email || customer.email || null,
      address: input.address?.trim() || customer.address || null,
      city: input.city?.trim() || customer.city || null,
      state: input.state?.trim() || customer.state || "UT",
      zip: input.zip?.trim() || customer.zip || null,
      schedulingNotes: input.schedulingNotes?.trim() || null,
      source: "crm",
    },
  });

  await applyWinterizationSeasonTag(customer.id, seasonYear);
  return request;
}
