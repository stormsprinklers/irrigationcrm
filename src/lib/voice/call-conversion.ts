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
