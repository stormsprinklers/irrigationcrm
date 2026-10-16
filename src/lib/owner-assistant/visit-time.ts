const EXPLICIT_TIMEZONE = /(?:Z|[+-]\d{2}:\d{2})$/i;

type VisitTimeValidation =
  | { ok: true; startAt: Date; endAt: Date }
  | { ok: false; error: string; code: string };

export function validateOwnerAssistantVisitTime(
  rawStartAt: unknown,
  rawEndAt: unknown,
  now = new Date()
): VisitTimeValidation {
  const startText = typeof rawStartAt === "string" ? rawStartAt.trim() : "";
  const endText = typeof rawEndAt === "string" ? rawEndAt.trim() : "";
  if (!EXPLICIT_TIMEZONE.test(startText) || !EXPLICIT_TIMEZONE.test(endText)) {
    return {
      ok: false,
      code: "TIMEZONE_REQUIRED",
      error: "Appointment times must include an explicit timezone offset",
    };
  }

  const startAt = new Date(startText);
  const endAt = new Date(endText);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
    return { ok: false, code: "INVALID", error: "Valid startAt and endAt are required" };
  }
  if (startAt.getTime() < now.getTime() - 60_000) {
    return {
      ok: false,
      code: "PAST_DATE",
      error: `Appointments must be in the future. Current server time is ${now.toISOString()}`,
    };
  }
  if (endAt.getTime() - startAt.getTime() > 24 * 60 * 60 * 1000) {
    return { ok: false, code: "INVALID", error: "A visit cannot exceed 24 hours" };
  }
  return { ok: true, startAt, endAt };
}
