export const BOOKING_SLOT_MINUTES = 120;
export const BOOKING_SLOT_MINUTES_MIN = 15;
export const BOOKING_SLOT_MINUTES_MAX = 480;

export function clampOnlineBookingSlotMinutes(
  raw: unknown,
  fallback = BOOKING_SLOT_MINUTES
): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(BOOKING_SLOT_MINUTES_MAX, Math.max(BOOKING_SLOT_MINUTES_MIN, Math.round(n)));
}
