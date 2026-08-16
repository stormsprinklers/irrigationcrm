import { CallAttributionMethod, CallDirection } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  type ReportRangeInput,
  resolveReportRange,
} from "@/lib/reporting/date-range";
import { isCallAnswered } from "@/lib/voice/call-history";
import { CALL_OBJECTION_LABELS } from "@/lib/voice/summarize-call";

function clip(text: string | null | undefined, max: number) {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function sourceLabel(row: {
  trackingSource: string | null;
  attributionMethod: CallAttributionMethod;
  googleLsaLeadId: string | null;
  conversionTracking?: string | null;
  conversionMethod?: CallAttributionMethod | null;
  conversionLsaId?: string | null;
}) {
  const tracking =
    row.conversionTracking?.trim() ||
    row.trackingSource?.trim() ||
    "";
  if (tracking) return tracking;
  const method = row.conversionMethod ?? row.attributionMethod;
  if (row.conversionLsaId || row.googleLsaLeadId || method === CallAttributionMethod.LSA_CALLER_MATCH) {
    return "Google LSA";
  }
  if (method === CallAttributionMethod.PRIMARY_NUMBER) return "Primary";
  if (method === CallAttributionMethod.DIALED_TRACKING_NUMBER) return "Tracking number";
  return "Unknown";
}

function matchesSourceFilter(label: string, raw?: string) {
  const s = raw?.trim().toLowerCase() ?? "";
  if (!s) return true;
  const l = label.toLowerCase();
  if (s.includes("lsa") || s.includes("local service")) return l.includes("lsa");
  if (s.includes("ppc") || s.includes("google ads") || s.includes("google_ads")) {
    return l.includes("google ads") || l.includes("ppc") || l.includes("google ads");
  }
  return l.includes(s);
}

type Bucket = { key: string; calls: number; answered: number; booked: number };

function bump(map: Map<string, Bucket>, key: string, answered: boolean, booked: boolean) {
  const row = map.get(key) ?? { key, calls: 0, answered: 0, booked: 0 };
  row.calls += 1;
  if (answered) row.answered += 1;
  if (booked) row.booked += 1;
  map.set(key, row);
}

function rate(booked: number, answered: number) {
  if (!answered) return null;
  return Math.round((booked / answered) * 1000) / 10;
}

export async function getInboundCallCoachingReport(
  companyId: string,
  rangeInput: ReportRangeInput,
  opts?: {
    employeeName?: string;
    leadSource?: string;
    includeTranscripts?: boolean;
    callId?: string;
  }
) {
  const { start, end, label: rangeLabel } = resolveReportRange(rangeInput);
  const employeeNeedle = opts?.employeeName?.trim().toLowerCase() ?? "";

  if (opts?.callId) {
    const one = await prisma.callLog.findFirst({
      where: { id: opts.callId, companyId, direction: CallDirection.INBOUND },
      include: {
        conversion: {
          select: {
            booked: true,
            trackingSource: true,
            attributionMethod: true,
            googleLsaLeadId: true,
            answeredBy: { select: { id: true, name: true } },
          },
        },
        handledBy: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
      },
    });
    if (!one) return { range: rangeLabel, call: null as null };
    const answeredBy =
      one.conversion?.answeredBy ?? one.handledBy ?? one.user ?? null;
    return {
      range: rangeLabel,
      call: {
        id: one.id,
        startedAt: one.startedAt.toISOString(),
        durationSec: one.durationSec,
        answeredBy: answeredBy ? { id: answeredBy.id, name: answeredBy.name } : null,
        leadSource: sourceLabel({
          trackingSource: one.trackingSource,
          attributionMethod: one.attributionMethod,
          googleLsaLeadId: one.googleLsaLeadId,
          conversionTracking: one.conversion?.trackingSource,
          conversionMethod: one.conversion?.attributionMethod,
          conversionLsaId: one.conversion?.googleLsaLeadId,
        }),
        booked: Boolean(one.conversion?.booked || one.visitId),
        customer: one.customer,
        summary: clip(one.aiSummary, 1200),
        objectionCategory: one.objectionCategory,
        objectionReason: one.objectionReason,
        transcript: clip(one.transcript, 4000),
      },
    };
  }

  const logs = await prisma.callLog.findMany({
    where: {
      companyId,
      direction: CallDirection.INBOUND,
      startedAt: { gte: start, lte: end },
    },
    select: {
      id: true,
      startedAt: true,
      durationSec: true,
      status: true,
      dispositionNote: true,
      trackingSource: true,
      attributionMethod: true,
      googleLsaLeadId: true,
      visitId: true,
      aiSummary: true,
      objectionCategory: true,
      objectionReason: true,
      transcript: true,
      handledBy: { select: { id: true, name: true } },
      user: { select: { id: true, name: true } },
      conversion: {
        select: {
          booked: true,
          trackingSource: true,
          attributionMethod: true,
          googleLsaLeadId: true,
          answeredBy: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { startedAt: "desc" },
    take: 250,
  });

  const byEmployee = new Map<string, Bucket>();
  const bySource = new Map<string, Bucket>();
  const byObjection = new Map<string, Bucket>();
  const unbookedSamples: Array<Record<string, unknown>> = [];
  const bookedSamples: Array<Record<string, unknown>> = [];
  const transcriptExcerpts: Array<Record<string, unknown>> = [];

  let inbound = 0;
  let answeredCount = 0;
  let bookedCount = 0;
  let withSummary = 0;

  for (const log of logs) {
    const answeredBy = log.conversion?.answeredBy ?? log.handledBy ?? log.user ?? null;
    if (employeeNeedle) {
      const name = answeredBy?.name?.toLowerCase() ?? "";
      if (!name.includes(employeeNeedle)) continue;
    }

    const leadSource = sourceLabel({
      trackingSource: log.trackingSource,
      attributionMethod: log.attributionMethod,
      googleLsaLeadId: log.googleLsaLeadId,
      conversionTracking: log.conversion?.trackingSource,
      conversionMethod: log.conversion?.attributionMethod,
      conversionLsaId: log.conversion?.googleLsaLeadId,
    });
    if (!matchesSourceFilter(leadSource, opts?.leadSource)) continue;

    const answered =
      Boolean(answeredBy) ||
      isCallAnswered(log.status, log.durationSec, { dispositionNote: log.dispositionNote });
    const booked = Boolean(log.conversion?.booked || log.visitId);

    inbound += 1;
    if (answered) answeredCount += 1;
    if (booked) bookedCount += 1;
    if (log.aiSummary?.trim()) withSummary += 1;

    bump(byEmployee, answeredBy?.name ?? "Unanswered / unknown", answered, booked);
    bump(bySource, leadSource, answered, booked);
    if (answered && !booked && log.objectionCategory && log.objectionCategory !== "NA") {
      bump(
        byObjection,
        CALL_OBJECTION_LABELS[log.objectionCategory] ?? log.objectionCategory,
        answered,
        booked
      );
    }

    const sample = {
      id: log.id,
      startedAt: log.startedAt.toISOString(),
      durationSec: log.durationSec,
      answeredBy: answeredBy?.name ?? null,
      leadSource,
      booked,
      objectionCategory: log.objectionCategory,
      objectionReason: clip(log.objectionReason, 220),
      summary: clip(log.aiSummary, 320),
    };

    if (answered && !booked && unbookedSamples.length < 10 && sample.summary) {
      unbookedSamples.push(sample);
    }
    if (answered && booked && bookedSamples.length < 6 && sample.summary) {
      bookedSamples.push(sample);
    }
    if (
      opts?.includeTranscripts !== false &&
      answered &&
      !booked &&
      transcriptExcerpts.length < 4 &&
      log.transcript?.trim()
    ) {
      transcriptExcerpts.push({
        ...sample,
        transcript: clip(log.transcript, 500),
      });
    }
  }

  const toRows = (map: Map<string, Bucket>) =>
    [...map.values()]
      .map((row) => ({
        name: row.key,
        inbound: row.calls,
        answered: row.answered,
        booked: row.booked,
        bookingRatePercent: rate(row.booked, row.answered),
      }))
      .sort((a, b) => (b.answered || 0) - (a.answered || 0));

  return {
    range: rangeLabel,
    totals: {
      inbound,
      answered: answeredCount,
      booked: bookedCount,
      bookingRatePercent: rate(bookedCount, answeredCount),
      withSummary,
    },
    byEmployee: toRows(byEmployee),
    byLeadSource: toRows(bySource),
    byObjection: toRows(byObjection),
    unbookedAnsweredSamples: unbookedSamples,
    bookedSamples,
    transcriptExcerpts,
    note: "Booking = CallConversion.booked or a visit linked on the call. Coaching must be grounded in these summaries/transcripts. Label recommendations as recommendations, not CRM facts. If few summaries exist, say the sample is too small.",
  };
}
