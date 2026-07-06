export const SCHEDULE_SLOT_MINUTES = 30;
export const DEFAULT_ARRIVAL_WINDOW_HOURS = 3;

export type ScheduleSlotClick = {
  day: Date;
  startAt: Date;
  endAt: Date;
  assignedUserId: string | null;
  assignedUserName: string | null;
};

export function snapScheduleSlot(
  day: Date,
  offsetY: number,
  hourHeight: number,
  scheduleStartHour: number,
  scheduleEndHour: number,
  arrivalWindowHours = DEFAULT_ARRIVAL_WINDOW_HOURS
): { startAt: Date; endAt: Date } {
  const rawHours = offsetY / hourHeight;
  const snappedMinutes =
    Math.round((rawHours * 60) / SCHEDULE_SLOT_MINUTES) * SCHEDULE_SLOT_MINUTES;

  const minMinutes = 0;
  const maxMinutes = (scheduleEndHour - scheduleStartHour) * 60;

  const clampedMinutes = Math.min(Math.max(snappedMinutes, minMinutes), maxMinutes);

  const startAt = new Date(day);
  startAt.setHours(scheduleStartHour, 0, 0, 0);
  startAt.setMinutes(startAt.getMinutes() + clampedMinutes);

  const endAt = new Date(startAt);
  endAt.setTime(endAt.getTime() + arrivalWindowHours * 60 * 60 * 1000);

  return { startAt, endAt };
}

export function buildScheduleSlotClick(
  day: Date,
  offsetY: number,
  hourHeight: number,
  scheduleStartHour: number,
  scheduleEndHour: number,
  assignedUserId: string | null,
  assignedUserName: string | null,
  arrivalWindowHours = DEFAULT_ARRIVAL_WINDOW_HOURS
): ScheduleSlotClick {
  const { startAt, endAt } = snapScheduleSlot(
    day,
    offsetY,
    hourHeight,
    scheduleStartHour,
    scheduleEndHour,
    arrivalWindowHours
  );

  return {
    day,
    startAt,
    endAt,
    assignedUserId,
    assignedUserName,
  };
}
