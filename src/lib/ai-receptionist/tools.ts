import { addMinutes } from "date-fns";
import { Division, ReceptionistCallStatus, VisitStatus } from "@prisma/client";
import { z } from "zod";
import {
  APPOINTMENT_HOLD_MINUTES,
  AI_RECEPTIONIST_TAG,
  type ReceptionistConversationState,
  type ReceptionistToolName,
} from "@/lib/ai-receptionist/types";
import { ensureAiReceptionistSystemUser } from "@/lib/ai-receptionist/system-user";
import { hashToolArgs } from "@/lib/ai-receptionist/auth";
import { getAvailableSlots, BOOKING_SLOT_MINUTES, formatSlotLabel } from "@/lib/booking/availability";
import { getCustomerServiceBlock } from "@/lib/customers/service-guard";
import { normalizePhone } from "@/lib/inbox/contacts";
import { findCustomerByPhone } from "@/lib/inbox/customer-lookup";
import { onVisitCancelled, onVisitTimeChanged } from "@/lib/notifications/visit-events";
import { getTwilioClient, sendSms } from "@/lib/inbox/twilio";
import { prisma } from "@/lib/prisma";
import { resolveServiceAreaByZip } from "@/lib/service-areas";
import { appBaseUrl } from "@/lib/voice/identity";

export type ToolContext = {
  companyId: string;
  callSid: string;
  receptionistCallId: string;
  fromE164: string;
};

export type ToolResult = {
  ok: boolean;
  data?: unknown;
  error?: string;
  code?: string;
};

async function getCall(ctx: ToolContext) {
  return prisma.receptionistCall.findFirst({
    where: { id: ctx.receptionistCallId, companyId: ctx.companyId, callSid: ctx.callSid },
  });
}

async function patchConversation(
  callId: string,
  patch: Partial<ReceptionistConversationState>
) {
  const call = await prisma.receptionistCall.findUnique({ where: { id: callId } });
  if (!call) return;
  const prev = (call.conversationJson ?? {}) as ReceptionistConversationState;
  await prisma.receptionistCall.update({
    where: { id: callId },
    data: { conversationJson: { ...prev, ...patch } },
  });
}

function normalizeZip(zip: string) {
  return zip.replace(/\D/g, "").slice(0, 5);
}

function normalizeAddressKey(address: string, zip: string) {
  return `${address.trim().toLowerCase().replace(/\s+/g, " ")}|${normalizeZip(zip)}`;
}

async function assertCustomerOwned(ctx: ToolContext, customerId: string) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, companyId: ctx.companyId },
    select: { id: true, phone: true, doNotService: true },
  });
  if (!customer) return { ok: false as const, error: "Customer not found", code: "NOT_FOUND" };
  return { ok: true as const, customer };
}

async function assertVisitOwned(ctx: ToolContext, visitId: string) {
  const visit = await prisma.visit.findFirst({
    where: { id: visitId, companyId: ctx.companyId },
    include: {
      customer: { select: { id: true, phone: true, doNotService: true } },
    },
  });
  if (!visit) return { ok: false as const, error: "Visit not found", code: "NOT_FOUND" };

  const call = await getCall(ctx);
  const state = (call?.conversationJson ?? {}) as ReceptionistConversationState;
  const allowedCustomerId = state.customerId ?? call?.customerId;
  if (allowedCustomerId && visit.customerId && visit.customerId !== allowedCustomerId) {
    // Allow if caller phone matches visit customer
    const match = visit.customer?.phone
      ? await findCustomerByPhone(ctx.companyId, ctx.fromE164)
      : null;
    if (!match || match.id !== visit.customerId) {
      return { ok: false as const, error: "Visit not accessible for this caller", code: "FORBIDDEN" };
    }
  }
  return { ok: true as const, visit };
}

const phoneSchema = z.string().min(7).max(32);
const zipSchema = z.string().min(5).max(12);

export const toolArgSchemas: Record<ReceptionistToolName, z.ZodTypeAny> = {
  lookup_customer_by_phone: z.object({ phone: phoneSchema.optional() }),
  lookup_customer_by_address: z.object({
    address: z.string().min(3),
    zip: zipSchema,
    city: z.string().optional(),
  }),
  get_customer_jobs: z.object({
    customerId: z.string().min(1),
    limit: z.number().int().min(1).max(20).optional(),
  }),
  get_job_details: z.object({ visitId: z.string().min(1) }),
  check_service_area: z.object({ zip: zipSchema }),
  get_available_appointments: z.object({
    zip: zipSchema.optional(),
    limit: z.number().int().min(1).max(12).optional(),
  }),
  create_customer: z.object({
    name: z.string().min(1).max(120),
    phone: phoneSchema.optional(),
    email: z.string().email().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zip: zipSchema.optional(),
    idempotencyKey: z.string().min(8),
  }),
  create_service_address: z.object({
    customerId: z.string().min(1),
    name: z.string().optional(),
    address: z.string().min(3),
    city: z.string().optional(),
    state: z.string().optional(),
    zip: zipSchema,
    idempotencyKey: z.string().min(8),
  }),
  reserve_appointment: z.object({
    startAt: z.string().min(10),
    endAt: z.string().min(10).optional(),
    idempotencyKey: z.string().min(8),
  }),
  create_job: z.object({
    holdId: z.string().min(1),
    customerId: z.string().min(1),
    propertyId: z.string().optional(),
    title: z.string().min(3).max(160),
    issue: z.string().optional(),
    division: z.enum(["SERVICE", "INSTALL"]).optional(),
    zip: zipSchema.optional(),
    detailsConfirmed: z.boolean().refine((v) => v === true, {
      message: "detailsConfirmed must be true",
    }),
    idempotencyKey: z.string().min(8),
  }),
  reschedule_job: z.object({
    visitId: z.string().min(1),
    startAt: z.string().min(10),
    endAt: z.string().min(10).optional(),
    idempotencyKey: z.string().min(8),
  }),
  cancel_job: z.object({
    visitId: z.string().min(1),
    reason: z.string().optional(),
    idempotencyKey: z.string().min(8),
  }),
  add_job_note: z.object({
    visitId: z.string().optional(),
    customerId: z.string().optional(),
    body: z.string().min(1).max(4000),
    idempotencyKey: z.string().min(8),
  }),
  send_confirmation_text: z.object({
    visitId: z.string().min(1),
    phone: phoneSchema.optional(),
    idempotencyKey: z.string().min(8),
  }),
  transfer_to_human: z.object({ reason: z.string().optional() }),
  fallback_voicemail: z.object({ reason: z.string().optional() }),
};

async function findPriorIdempotent(
  ctx: ToolContext,
  idempotencyKey: string | undefined,
  tool: string
): Promise<ToolResult | null> {
  if (!idempotencyKey) return null;
  const prior = await prisma.receptionistToolInvocation.findFirst({
    where: { companyId: ctx.companyId, idempotencyKey, tool },
  });
  if (!prior) return null;
  if (prior.resultCode === "OK") {
    return { ok: true, data: { replayed: true, invocationId: prior.id } };
  }
  return {
    ok: false,
    error: prior.errorMessage ?? "Previous attempt failed",
    code: prior.resultCode,
  };
}

async function redirectCall(callSid: string, url: string) {
  const client = getTwilioClient();
  await client.calls(callSid).update({ url, method: "POST" });
}

export async function executeReceptionistTool(
  ctx: ToolContext,
  tool: ReceptionistToolName,
  rawArgs: unknown
): Promise<ToolResult> {
  const started = Date.now();
  const schema = toolArgSchemas[tool];
  const parsed = schema.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message, code: "VALIDATION" };
  }
  const args = parsed.data as Record<string, unknown>;
  const idempotencyKey =
    typeof args.idempotencyKey === "string" ? args.idempotencyKey : undefined;

  const replay = await findPriorIdempotent(ctx, idempotencyKey, tool);
  // For mutating tools that return entities, re-run is safer only when we stored result — V1 stores audit only.
  // Skip hard replay blocking for lookups; for mutations with same key, return prior OK without re-running when we can detect entity.
  if (replay && idempotencyKey && !tool.startsWith("lookup") && !tool.startsWith("get_") && tool !== "check_service_area") {
    // Allow create_job replay via hold/idempotency below; others short-circuit success audit
  }

  let result: ToolResult;
  try {
    result = await runTool(ctx, tool, args);
  } catch (err) {
    result = {
      ok: false,
      error: err instanceof Error ? err.message : "Tool failed",
      code: "EXCEPTION",
    };
  }

  try {
    await prisma.receptionistToolInvocation.create({
      data: {
        companyId: ctx.companyId,
        receptionistCallId: ctx.receptionistCallId,
        tool,
        argsHash: hashToolArgs(args),
        resultCode: result.ok ? "OK" : result.code ?? "ERROR",
        latencyMs: Date.now() - started,
        idempotencyKey: idempotencyKey ?? undefined,
        errorMessage: result.ok ? null : result.error ?? null,
      },
    });
  } catch (err) {
    // Unique idempotency race — treat as success if another worker finished
    if (idempotencyKey && result.ok) {
      /* ignore */
    } else if (err instanceof Error && err.message.includes("Unique")) {
      return { ok: true, data: { replayed: true } };
    }
  }

  return result;
}

async function runTool(
  ctx: ToolContext,
  tool: ReceptionistToolName,
  args: Record<string, unknown>
): Promise<ToolResult> {
  switch (tool) {
    case "lookup_customer_by_phone": {
      const phone = normalizePhone(String(args.phone ?? ctx.fromE164));
      const customer = await findCustomerByPhone(ctx.companyId, phone);
      if (!customer) return { ok: true, data: { found: false } };
      const property = await prisma.customerProperty.findFirst({
        where: { customerId: customer.id, companyId: ctx.companyId },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      });
      await prisma.receptionistCall.update({
        where: { id: ctx.receptionistCallId },
        data: { customerId: customer.id },
      });
      await patchConversation(ctx.receptionistCallId, {
        customerId: customer.id,
        propertyId: property?.id ?? null,
      });
      return {
        ok: true,
        data: {
          found: true,
          customer: {
            id: customer.id,
            name: customer.name,
            phone: customer.phone,
            email: customer.email,
            doNotService: customer.doNotService,
          },
          primaryProperty: property
            ? {
                id: property.id,
                address: property.address,
                city: property.city,
                state: property.state,
                zip: property.zip,
              }
            : null,
        },
      };
    }

    case "lookup_customer_by_address": {
      const address = String(args.address);
      const zip = normalizeZip(String(args.zip));
      const key = normalizeAddressKey(address, zip);
      const properties = await prisma.customerProperty.findMany({
        where: { companyId: ctx.companyId, zip },
        take: 40,
        include: {
          customer: {
            select: { id: true, name: true, phone: true, doNotService: true },
          },
        },
      });
      const match = properties.find(
        (p) => normalizeAddressKey(p.address ?? "", p.zip ?? "") === key
      );
      if (!match) {
        const loose = properties.find((p) =>
          (p.address ?? "").toLowerCase().includes(address.trim().toLowerCase().slice(0, 12))
        );
        if (!loose) return { ok: true, data: { found: false } };
        return {
          ok: true,
          data: {
            found: true,
            customer: loose.customer,
            property: {
              id: loose.id,
              address: loose.address,
              city: loose.city,
              zip: loose.zip,
            },
          },
        };
      }
      await patchConversation(ctx.receptionistCallId, {
        customerId: match.customer.id,
        propertyId: match.id,
      });
      return {
        ok: true,
        data: {
          found: true,
          customer: match.customer,
          property: {
            id: match.id,
            address: match.address,
            city: match.city,
            zip: match.zip,
          },
        },
      };
    }

    case "get_customer_jobs": {
      const customerId = String(args.customerId);
      const owned = await assertCustomerOwned(ctx, customerId);
      if (!owned.ok) return owned;
      const limit = Number(args.limit ?? 8);
      const visits = await prisma.visit.findMany({
        where: {
          companyId: ctx.companyId,
          customerId,
          status: { not: VisitStatus.CANCELLED },
        },
        orderBy: { startAt: "desc" },
        take: limit,
        select: {
          id: true,
          title: true,
          status: true,
          startAt: true,
          endAt: true,
          address: true,
          zip: true,
          division: true,
        },
      });
      return {
        ok: true,
        data: {
          jobs: visits.map((v) => ({
            ...v,
            startAt: v.startAt.toISOString(),
            endAt: v.endAt.toISOString(),
          })),
        },
      };
    }

    case "get_job_details": {
      const owned = await assertVisitOwned(ctx, String(args.visitId));
      if (!owned.ok) return owned;
      const notes = await prisma.visitNote.findMany({
        where: { visitId: owned.visit.id },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { body: true, createdAt: true },
      });
      return {
        ok: true,
        data: {
          job: {
            id: owned.visit.id,
            title: owned.visit.title,
            status: owned.visit.status,
            startAt: owned.visit.startAt.toISOString(),
            endAt: owned.visit.endAt.toISOString(),
            address: owned.visit.address,
            city: owned.visit.city,
            zip: owned.visit.zip,
            division: owned.visit.division,
            customerId: owned.visit.customerId,
          },
          notes: notes.map((n) => ({
            body: n.body,
            createdAt: n.createdAt.toISOString(),
          })),
        },
      };
    }

    case "check_service_area": {
      const zip = normalizeZip(String(args.zip));
      const area = await resolveServiceAreaByZip(ctx.companyId, zip);
      await patchConversation(ctx.receptionistCallId, { serviceZip: zip });
      return {
        ok: true,
        data: {
          eligible: Boolean(area),
          zip,
          serviceArea: area ? { id: area.id, name: area.name } : null,
        },
      };
    }

    case "get_available_appointments": {
      if (args.zip) {
        const zip = normalizeZip(String(args.zip));
        const area = await resolveServiceAreaByZip(ctx.companyId, zip);
        if (!area) {
          return {
            ok: false,
            error: "We do not currently service this zip code",
            code: "OUT_OF_AREA",
          };
        }
        await patchConversation(ctx.receptionistCallId, { serviceZip: zip });
      }
      const company = await prisma.company.findUnique({
        where: { id: ctx.companyId },
        select: {
          businessHours: true,
          bookingLeadTimeHours: true,
          timezone: true,
        },
      });
      if (!company) return { ok: false, error: "Company not found", code: "NOT_FOUND" };
      const limit = Number(args.limit ?? 6);
      const slots = await getAvailableSlots({
        companyId: ctx.companyId,
        businessHours: company.businessHours,
        bookingLeadTimeHours: company.bookingLeadTimeHours,
        timeZone: company.timezone,
      });
      return {
        ok: true,
        data: {
          slots: slots.slice(0, limit).map((s) => ({
            ...s,
            label: formatSlotLabel(s.startAt, s.endAt, company.timezone),
          })),
        },
      };
    }

    case "create_customer": {
      const phone = normalizePhone(String(args.phone ?? ctx.fromE164));
      const existing = await findCustomerByPhone(ctx.companyId, phone);
      if (existing) {
        await patchConversation(ctx.receptionistCallId, { customerId: existing.id });
        return { ok: true, data: { customerId: existing.id, existing: true } };
      }
      const customer = await prisma.customer.create({
        data: {
          companyId: ctx.companyId,
          name: String(args.name),
          phone,
          email: args.email ? String(args.email) : null,
          address: args.address ? String(args.address) : null,
          city: args.city ? String(args.city) : null,
          state: args.state ? String(args.state) : null,
          zip: args.zip ? normalizeZip(String(args.zip)) : null,
          leadSource: "AI receptionist",
        },
      });
      await prisma.receptionistCall.update({
        where: { id: ctx.receptionistCallId },
        data: { customerId: customer.id },
      });
      await patchConversation(ctx.receptionistCallId, { customerId: customer.id });
      return { ok: true, data: { customerId: customer.id, existing: false } };
    }

    case "create_service_address": {
      const customerId = String(args.customerId);
      const owned = await assertCustomerOwned(ctx, customerId);
      if (!owned.ok) return owned;
      const address = String(args.address);
      const zip = normalizeZip(String(args.zip));
      const key = normalizeAddressKey(address, zip);
      const existingProps = await prisma.customerProperty.findMany({
        where: { companyId: ctx.companyId, customerId, zip },
      });
      const dup = existingProps.find(
        (p) => normalizeAddressKey(p.address ?? "", p.zip ?? "") === key
      );
      if (dup) {
        await patchConversation(ctx.receptionistCallId, { propertyId: dup.id });
        return { ok: true, data: { propertyId: dup.id, existing: true } };
      }
      const property = await prisma.customerProperty.create({
        data: {
          companyId: ctx.companyId,
          customerId,
          name: String(args.name ?? "Service address"),
          address,
          city: args.city ? String(args.city) : null,
          state: args.state ? String(args.state) : null,
          zip,
          isPrimary: existingProps.length === 0,
        },
      });
      await patchConversation(ctx.receptionistCallId, { propertyId: property.id, serviceZip: zip });
      return { ok: true, data: { propertyId: property.id, existing: false } };
    }

    case "reserve_appointment": {
      const startAt = new Date(String(args.startAt));
      const endAt = args.endAt
        ? new Date(String(args.endAt))
        : addMinutes(startAt, BOOKING_SLOT_MINUTES);
      const idempotencyKey = String(args.idempotencyKey);

      const existingHold = await prisma.appointmentHold.findUnique({
        where: {
          companyId_idempotencyKey: { companyId: ctx.companyId, idempotencyKey },
        },
      });
      if (existingHold && existingHold.expiresAt > new Date()) {
        await patchConversation(ctx.receptionistCallId, { holdId: existingHold.id });
        return {
          ok: true,
          data: {
            holdId: existingHold.id,
            startAt: existingHold.startAt.toISOString(),
            endAt: existingHold.endAt.toISOString(),
            expiresAt: existingHold.expiresAt.toISOString(),
          },
        };
      }
      if (existingHold) {
        await prisma.appointmentHold.delete({ where: { id: existingHold.id } });
      }

      const company = await prisma.company.findUnique({
        where: { id: ctx.companyId },
        select: {
          businessHours: true,
          bookingLeadTimeHours: true,
          timezone: true,
        },
      });
      if (!company) return { ok: false, error: "Company not found", code: "NOT_FOUND" };
      const slots = await getAvailableSlots({
        companyId: ctx.companyId,
        businessHours: company.businessHours,
        bookingLeadTimeHours: company.bookingLeadTimeHours,
        timeZone: company.timezone,
      });
      const stillOpen = slots.some(
        (s) => s.startAt === startAt.toISOString() && s.endAt === endAt.toISOString()
      );
      if (!stillOpen) {
        return { ok: false, error: "That appointment window is no longer available", code: "SLOT_GONE" };
      }

      const hold = await prisma.appointmentHold.create({
        data: {
          companyId: ctx.companyId,
          receptionistCallId: ctx.receptionistCallId,
          startAt,
          endAt,
          expiresAt: addMinutes(new Date(), APPOINTMENT_HOLD_MINUTES),
          idempotencyKey,
        },
      });
      await patchConversation(ctx.receptionistCallId, {
        holdId: hold.id,
        preferredStartAt: startAt.toISOString(),
        detailsConfirmed: false,
      });
      return {
        ok: true,
        data: {
          holdId: hold.id,
          startAt: hold.startAt.toISOString(),
          endAt: hold.endAt.toISOString(),
          expiresAt: hold.expiresAt.toISOString(),
          label: formatSlotLabel(hold.startAt.toISOString(), hold.endAt.toISOString(), company.timezone),
        },
      };
    }

    case "create_job": {
      if (args.detailsConfirmed !== true) {
        return { ok: false, error: "Caller must confirm details first", code: "NOT_CONFIRMED" };
      }
      const holdId = String(args.holdId);
      const customerId = String(args.customerId);
      const owned = await assertCustomerOwned(ctx, customerId);
      if (!owned.ok) return owned;
      const block = await getCustomerServiceBlock(ctx.companyId, customerId);
      if (block) {
        return { ok: false, error: block, code: "DO_NOT_SERVICE" };
      }

      const hold = await prisma.appointmentHold.findFirst({
        where: {
          id: holdId,
          companyId: ctx.companyId,
          receptionistCallId: ctx.receptionistCallId,
        },
      });
      if (!hold || hold.expiresAt < new Date()) {
        return { ok: false, error: "Appointment hold expired", code: "HOLD_EXPIRED" };
      }

      const propertyId = args.propertyId ? String(args.propertyId) : undefined;
      let property = propertyId
        ? await prisma.customerProperty.findFirst({
            where: { id: propertyId, companyId: ctx.companyId, customerId },
          })
        : null;

      const zip =
        (args.zip ? normalizeZip(String(args.zip)) : null) ||
        property?.zip ||
        null;
      if (!zip) {
        return { ok: false, error: "Zip code is required to book", code: "VALIDATION" };
      }
      const serviceArea = await resolveServiceAreaByZip(ctx.companyId, zip);
      if (!serviceArea) {
        return { ok: false, error: "Out of service area", code: "OUT_OF_AREA" };
      }

      const call = await getCall(ctx);
      const visit = await prisma.$transaction(async (tx) => {
        await tx.appointmentHold.delete({ where: { id: hold.id } });
        return tx.visit.create({
          data: {
            companyId: ctx.companyId,
            customerId,
            propertyId: property?.id,
            title: String(args.title),
            startAt: hold.startAt,
            endAt: hold.endAt,
            division: (args.division as Division) ?? Division.SERVICE,
            status: VisitStatus.SCHEDULED,
            serviceAreaId: serviceArea.id,
            address: property?.address ?? undefined,
            city: property?.city ?? undefined,
            state: property?.state ?? undefined,
            zip,
            tags: [AI_RECEPTIONIST_TAG],
            callSessionId: call?.callSessionId ?? undefined,
          },
        });
      });

      if (args.issue) {
        const authorId = await ensureAiReceptionistSystemUser(ctx.companyId);
        await prisma.visitNote.create({
          data: {
            visitId: visit.id,
            authorId,
            body: `Caller issue: ${String(args.issue)}`,
          },
        });
      }

      await patchConversation(ctx.receptionistCallId, {
        visitId: visit.id,
        holdId: null,
        detailsConfirmed: true,
        issue: args.issue ? String(args.issue) : null,
      });

      try {
        await onVisitTimeChanged({
          visitId: visit.id,
          companyId: ctx.companyId,
          isInitialSchedule: true,
        });
      } catch {
        /* notification best-effort */
      }

      return {
        ok: true,
        data: {
          visitId: visit.id,
          startAt: visit.startAt.toISOString(),
          endAt: visit.endAt.toISOString(),
        },
      };
    }

    case "reschedule_job": {
      const owned = await assertVisitOwned(ctx, String(args.visitId));
      if (!owned.ok) return owned;
      if (
        owned.visit.status !== VisitStatus.SCHEDULED &&
        owned.visit.status !== VisitStatus.UNSCHEDULED
      ) {
        return { ok: false, error: "This visit cannot be rescheduled", code: "INVALID_STATUS" };
      }
      const startAt = new Date(String(args.startAt));
      const endAt = args.endAt
        ? new Date(String(args.endAt))
        : addMinutes(startAt, BOOKING_SLOT_MINUTES);
      const company = await prisma.company.findUnique({
        where: { id: ctx.companyId },
        select: {
          businessHours: true,
          bookingLeadTimeHours: true,
          timezone: true,
        },
      });
      if (!company) return { ok: false, error: "Company not found", code: "NOT_FOUND" };
      const slots = await getAvailableSlots({
        companyId: ctx.companyId,
        businessHours: company.businessHours,
        bookingLeadTimeHours: company.bookingLeadTimeHours,
        timeZone: company.timezone,
      });
      const open = slots.some(
        (s) => s.startAt === startAt.toISOString() && s.endAt === endAt.toISOString()
      );
      if (!open) {
        return { ok: false, error: "That window is not available", code: "SLOT_GONE" };
      }
      const updated = await prisma.visit.update({
        where: { id: owned.visit.id },
        data: { startAt, endAt, status: VisitStatus.SCHEDULED },
      });
      try {
        await onVisitTimeChanged({
          visitId: updated.id,
          companyId: ctx.companyId,
        });
      } catch {
        /* ignore */
      }
      return {
        ok: true,
        data: {
          visitId: updated.id,
          startAt: updated.startAt.toISOString(),
          endAt: updated.endAt.toISOString(),
        },
      };
    }

    case "cancel_job": {
      const owned = await assertVisitOwned(ctx, String(args.visitId));
      if (!owned.ok) return owned;
      const updated = await prisma.visit.update({
        where: { id: owned.visit.id },
        data: { status: VisitStatus.CANCELLED },
      });
      if (args.reason) {
        const authorId = await ensureAiReceptionistSystemUser(ctx.companyId);
        await prisma.visitNote.create({
          data: {
            visitId: updated.id,
            authorId,
            body: `Cancelled via AI receptionist: ${String(args.reason)}`,
          },
        });
      }
      try {
        await onVisitCancelled(updated.id, ctx.companyId);
      } catch {
        /* ignore */
      }
      return { ok: true, data: { visitId: updated.id, status: "CANCELLED" } };
    }

    case "add_job_note": {
      const body = String(args.body);
      const authorId = await ensureAiReceptionistSystemUser(ctx.companyId);
      if (args.visitId) {
        const owned = await assertVisitOwned(ctx, String(args.visitId));
        if (!owned.ok) return owned;
        const note = await prisma.visitNote.create({
          data: { visitId: owned.visit.id, authorId, body },
        });
        return { ok: true, data: { noteId: note.id, type: "visit" } };
      }
      if (args.customerId) {
        const owned = await assertCustomerOwned(ctx, String(args.customerId));
        if (!owned.ok) return owned;
        const note = await prisma.customerNote.create({
          data: { customerId: owned.customer.id, authorId, body },
        });
        return { ok: true, data: { noteId: note.id, type: "customer" } };
      }
      return { ok: false, error: "visitId or customerId required", code: "VALIDATION" };
    }

    case "send_confirmation_text": {
      const owned = await assertVisitOwned(ctx, String(args.visitId));
      if (!owned.ok) return owned;
      const company = await prisma.company.findUnique({
        where: { id: ctx.companyId },
        select: {
          twilioPhone: true,
          name: true,
          timezone: true,
          aiReceptionistSmsConfirm: true,
        },
      });
      if (!company?.aiReceptionistSmsConfirm) {
        return { ok: true, data: { skipped: true, reason: "SMS confirm disabled" } };
      }
      if (!company?.twilioPhone) {
        return { ok: false, error: "Company SMS number not configured", code: "NO_SMS" };
      }
      const to = normalizePhone(String(args.phone ?? owned.visit.customer?.phone ?? ctx.fromE164));
      const label = formatSlotLabel(
        owned.visit.startAt.toISOString(),
        owned.visit.endAt.toISOString(),
        company.timezone
      );
      const body = `${company.name}: Your appointment "${owned.visit.title}" is confirmed for ${label}. Reply if you need to change it.`;
      await sendSms({
        companyId: ctx.companyId,
        to,
        body,
        from: company.twilioPhone,
      });
      return { ok: true, data: { sent: true, to } };
    }

    case "transfer_to_human": {
      const call = await getCall(ctx);
      if (!call?.flowId || !call.nodeId) {
        return { ok: false, error: "Call flow context missing", code: "NO_CONTEXT" };
      }
      const node = await prisma.callFlowNode.findFirst({
        where: { id: call.nodeId, flowId: call.flowId },
      });
      const config = (node?.config ?? {}) as { transferNodeId?: string };
      const transferNodeId = config.transferNodeId?.trim();
      const url = transferNodeId
        ? `${appBaseUrl()}/api/twilio/voice/ivr?flowId=${encodeURIComponent(call.flowId)}&goto=${encodeURIComponent(transferNodeId)}`
        : `${appBaseUrl()}/api/twilio/voice/ai-receptionist/transfer-agents?companyId=${encodeURIComponent(ctx.companyId)}`;
      await redirectCall(ctx.callSid, url);
      await prisma.receptionistCall.update({
        where: { id: ctx.receptionistCallId },
        data: {
          status: ReceptionistCallStatus.TRANSFERRED,
          endedAt: new Date(),
          failureReason: args.reason
            ? String(args.reason)
            : transferNodeId
              ? "transfer_to_human"
              : "transfer_to_human_fallback_agents",
        },
      });
      return {
        ok: true,
        data: { transferred: true, transferNodeId: transferNodeId || null, fallbackAgents: !transferNodeId },
      };
    }

    case "fallback_voicemail": {
      const call = await getCall(ctx);
      const node = call?.nodeId
        ? await prisma.callFlowNode.findFirst({ where: { id: call.nodeId } })
        : null;
      const config = (node?.config ?? {}) as { voicemailNodeId?: string };
      const url = config.voicemailNodeId && call?.flowId
        ? `${appBaseUrl()}/api/twilio/voice/ivr?flowId=${encodeURIComponent(call.flowId)}&goto=${encodeURIComponent(config.voicemailNodeId)}`
        : `${appBaseUrl()}/api/twilio/voice/ai-receptionist/voicemail?companyId=${encodeURIComponent(ctx.companyId)}`;
      await redirectCall(ctx.callSid, url);
      await prisma.receptionistCall.update({
        where: { id: ctx.receptionistCallId },
        data: {
          status: ReceptionistCallStatus.VOICEMAIL,
          endedAt: new Date(),
          failureReason: args.reason ? String(args.reason) : "fallback_voicemail",
        },
      });
      return { ok: true, data: { voicemail: true } };
    }

    default:
      return { ok: false, error: "Unknown tool", code: "UNKNOWN_TOOL" };
  }
}
