const FUTURE_CLOCK_TOLERANCE_MS = 5 * 60 * 1000;

export function validateTimesheetCorrection(
  clockInAt: Date,
  clockOutAt: Date | null,
  now = new Date()
) {
  if (Number.isNaN(clockInAt.getTime())) return "Enter a valid clock-in time";
  if (clockOutAt && Number.isNaN(clockOutAt.getTime())) return "Enter a valid clock-out time";
  if (clockInAt.getTime() > now.getTime() + FUTURE_CLOCK_TOLERANCE_MS) {
    return "Clock-in time cannot be in the future";
  }
  if (clockOutAt && clockOutAt.getTime() > now.getTime() + FUTURE_CLOCK_TOLERANCE_MS) {
    return "Clock-out time cannot be in the future";
  }
  if (clockOutAt && clockOutAt <= clockInAt) {
    return "Clock-out time must be after clock-in time";
  }
  return null;
}
