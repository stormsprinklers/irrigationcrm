import {
  AttributionFirstTouchMethod,
  CallAttributionMethod,
  CallDisposition,
  CallDirection,
} from "@prisma/client";
import { normalizeAttribution, recordTouchEvent, resolvePersonByPhone } from "@/lib/attribution";
import { visitRevenue } from "@/lib/compensation/commission";
import { prisma } from "@/lib/prisma";
import {
  resolveInboundCallAttribution,
  type CallAttributionResult,
} from "@/lib/voice/call-attribution";

type SyncOptions = {
  answeredByUserId?: string | null;
  disposition?: CallDisposition;
  visitId?: string | null;
  customerId?: string | null;
  attribution?: CallAttributionResult | null;
  forceReattribute?: boolean;
};

/**
 * Upsert CallConversion from a CallLog and keep attribution / booking / revenue in sync.
 */
export async function syncCallConversionFromLog(
  callLogId: string,
  options: SyncOptions = {}
) {
  const log = await prisma.callLog.findUnique({
    where: { id: callLogId },
    include: {
      session: {
        select: { id: true, phoneNumberId: true, assignedUserId: true },
      },
      visit: {
        include: {
          lineItems: true,
          discounts: true,
        },
      },
    },
  });
  if (!log) return null;

  let attribution: CallAttributionResult | null = options.attribution ?? null;
  const needsAttribution =
    options.forceReattribute ||
    log.attributionMethod === CallAttributionMethod.UNKNOWN ||
    (!log.trackingSource && !log.googleLsaLeadId);

  if (
    !attribution &&
    needsAttribution &&
    log.direction === CallDirection.INBOUND
  ) {
    attribution = await resolveInboundCallAttribution({
      companyId: log.companyId,
      callerNumber: log.fromNumber,
      dialedNumber: log.toNumber,
      phoneNumberId: log.phoneNumberId ?? log.session?.phoneNumberId,
      aroundDate: log.startedAt,
    });

    await prisma.callLog.update({
      where: { id: log.id },
      data: {
        phoneNumberId: attribution.phoneNumberId,
        trackingSource: attribution.trackingSource,
        attributionMethod: attribution.method,
        googleLsaLeadId: attribution.googleLsaLeadId,
      },
    });
  }

  const disposition = options.disposition ?? log.disposition;
  const visitId = options.visitId ?? log.visitId;

  const existingConversion = await prisma.callConversion.findUnique({
    where: { callLogId: log.id },
    select: { answeredByUserId: true },
  });

  // Prefer an explicit answerer; never overwrite a known answerer with wrap-up user.
  const answeredByUserId =
    options.answeredByUserId ??
    existingConversion?.answeredByUserId ??
    log.userId ??
    log.session?.assignedUserId ??
    log.handledByUserId ??
    null;
  const customerId = options.customerId ?? log.customerId;
  const booked = disposition === CallDisposition.BOOKED && Boolean(visitId);
  const convertedAt = booked ? log.endedAt ?? new Date() : null;

  let revenueAmount: number | null = null;
  if (visitId) {
    const visit =
      log.visit?.id === visitId
        ? log.visit
        : await prisma.visit.findFirst({
            where: { id: visitId, companyId: log.companyId },
            include: { lineItems: true, discounts: true },
          });
    if (visit) {
      revenueAmount = visitRevenue(visit);
    }
  }

  const method =
    attribution?.method ?? log.attributionMethod ?? CallAttributionMethod.UNKNOWN;
  const trackingSource = attribution?.trackingSource ?? log.trackingSource;
  const googleLsaLeadId = attribution?.googleLsaLeadId ?? log.googleLsaLeadId;
  const phoneNumberId =
    attribution?.phoneNumberId ?? log.phoneNumberId ?? log.session?.phoneNumberId ?? null;

  const conversion = await prisma.callConversion.upsert({
    where: { callLogId: log.id },
    create: {
      companyId: log.companyId,
      callLogId: log.id,
      callSessionId: log.sessionId,
      answeredByUserId,
      disposition,
      booked,
      visitId,
      attributionMethod: method,
      phoneNumberId,
      trackingSource,
      googleLsaLeadId,
      callerNumber: log.fromNumber,
      dialedNumber: log.toNumber,
      customerId,
      revenueAmount,
      convertedAt,
    },
    update: {
      callSessionId: log.sessionId,
      answeredByUserId,
      disposition,
      booked,
      visitId,
      attributionMethod: method,
      phoneNumberId,
      trackingSource,
      googleLsaLeadId,
      callerNumber: log.fromNumber,
      dialedNumber: log.toNumber,
      customerId,
      revenueAmount,
      convertedAt: booked ? convertedAt ?? new Date() : null,
    },
  });

  const isLsa = method === CallAttributionMethod.LSA_CALLER_MATCH || Boolean(googleLsaLeadId);
  const normalized = normalizeAttribution({
    trackingSource,
    attributionMethod: method,
    leadSource: trackingSource,
  });

  let resolvedCustomerId = customerId;
  let resolvedLeadId: string | null = null;
  if (!resolvedCustomerId) {
    const matched = await resolvePersonByPhone(log.companyId, log.fromNumber);
    resolvedCustomerId = matched.customerId;
    resolvedLeadId = matched.leadId;
  }

  await recordTouchEvent({
    companyId: log.companyId,
    customerId: resolvedCustomerId,
    leadId: resolvedLeadId,
    callLogId: log.id,
    eventType: "INBOUND_CALL",
    method: isLsa ? AttributionFirstTouchMethod.LSA : AttributionFirstTouchMethod.CALL,
    normalized,
    phone: log.fromNumber,
    occurredAt: log.startedAt,
    metadata: {
      attributionMethod: method,
      googleLsaLeadId,
      dialedNumber: log.toNumber,
    },
  }).catch(() => {});

  return conversion;
}

/** Mark who answered an inbound softphone call and sync conversion. */
export async function recordCallAnswered(input: {
  companyId: string;
  sessionId: string;
  userId: string;
}) {
  const session = await prisma.callSession.findFirst({
    where: { id: input.sessionId, companyId: input.companyId },
  });
  if (!session) return null;

  await prisma.callSession.update({
    where: { id: session.id },
    data: {
      // Always record who actually answered (overwrite any pre-ring assignment).
      assignedUserId: input.userId,
      status: "IN_PROGRESS",
    },
  });

  const { recordCallParticipant } = await import("@/lib/voice/conference");
  const alreadyAnswered = await prisma.callParticipant.findFirst({
    where: {
      callSessionId: session.id,
      userId: input.userId,
      role: "ANSWERED",
    },
    select: { id: true },
  });
  if (!alreadyAnswered) {
    await recordCallParticipant({
      companyId: input.companyId,
      callSessionId: session.id,
      userId: input.userId,
      role: "ANSWERED",
    }).catch(() => {});
  }

  const callLog = await prisma.callLog.findFirst({
    where: { sessionId: session.id, companyId: input.companyId },
    orderBy: { startedAt: "desc" },
  });

  if (callLog) {
    await prisma.callLog.update({
      where: { id: callLog.id },
      data: {
        userId: input.userId,
        phoneNumberId: callLog.phoneNumberId ?? session.phoneNumberId,
      },
    });
    return syncCallConversionFromLog(callLog.id, {
      answeredByUserId: input.userId,
    });
  }

  // Status webhook may not have created the log yet — create a stub.
  const created = await prisma.callLog.create({
    data: {
      companyId: input.companyId,
      scope: "EXTERNAL",
      direction: session.direction,
      fromNumber: session.fromNumber,
      toNumber: session.toNumber,
      customerId: session.customerId,
      userId: input.userId,
      sessionId: session.id,
      phoneNumberId: session.phoneNumberId,
      twilioCallSid: session.callSid,
      status: "in-progress",
    },
  });

  return syncCallConversionFromLog(created.id, {
    answeredByUserId: input.userId,
  });
}

/** Link a booked visit to the call log + conversion (and mark BOOKED when appropriate). */
export async function linkVisitToCallSession(input: {
  companyId: string;
  callSessionId: string;
  visitId: string;
  answeredByUserId?: string | null;
  markBooked?: boolean;
}) {
  const callLog = await prisma.callLog.findFirst({
    where: { sessionId: input.callSessionId, companyId: input.companyId },
    orderBy: { startedAt: "desc" },
  });
  if (!callLog) return null;

  const disposition =
    input.markBooked === false ? callLog.disposition : CallDisposition.BOOKED;

  await prisma.callLog.update({
    where: { id: callLog.id },
    data: {
      visitId: input.visitId,
      disposition,
      ...(input.answeredByUserId && !callLog.userId
        ? { userId: input.answeredByUserId }
        : {}),
    },
  });

  return syncCallConversionFromLog(callLog.id, {
    visitId: input.visitId,
    disposition,
    answeredByUserId: input.answeredByUserId,
  });
}

/**
 * If a job is booked for the same customer (or phone) within ±15 minutes of a call,
 * mark that call BOOKED and link the visit — even without an explicit callSessionId.
 */
export async function linkVisitToNearbyCalls(input: {
  companyId: string;
  visitId: string;
  customerId?: string | null;
  phone?: string | null;
  aroundDate?: Date;
  windowMinutes?: number;
  answeredByUserId?: string | null;
}) {
  const windowMs = (input.windowMinutes ?? 15) * 60 * 1000;
  const around = input.aroundDate ?? new Date();
  const from = new Date(around.getTime() - windowMs);
  const to = new Date(around.getTime() + windowMs);

  const orFilters: Array<Record<string, unknown>> = [];
  if (input.customerId) {
    orFilters.push({ customerId: input.customerId });
  }
  if (input.phone?.trim()) {
    const { phoneLookupVariants } = await import("@/lib/inbox/phone");
    const variants = phoneLookupVariants(input.phone);
    orFilters.push({ fromNumber: { in: variants } });
    orFilters.push({ toNumber: { in: variants } });
  }
  if (!orFilters.length) return [];

  const logs = await prisma.callLog.findMany({
    where: {
      companyId: input.companyId,
      scope: "EXTERNAL",
      startedAt: { gte: from, lte: to },
      OR: orFilters,
      disposition: { not: CallDisposition.BOOKED },
    },
    select: { id: true, sessionId: true },
    take: 10,
    orderBy: { startedAt: "desc" },
  });

  const linked: string[] = [];
  for (const log of logs) {
    await prisma.callLog.update({
      where: { id: log.id },
      data: {
        visitId: input.visitId,
        disposition: CallDisposition.BOOKED,
        ...(input.customerId ? { customerId: input.customerId } : {}),
      },
    });
    await syncCallConversionFromLog(log.id, {
      visitId: input.visitId,
      disposition: CallDisposition.BOOKED,
      answeredByUserId: input.answeredByUserId,
      customerId: input.customerId,
    });
    if (log.sessionId) {
      await prisma.visit.updateMany({
        where: { id: input.visitId, callSessionId: null },
        data: { callSessionId: log.sessionId },
      });
    }
    linked.push(log.id);
  }
  return linked;
}

