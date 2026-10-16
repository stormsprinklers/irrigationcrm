export type OwnerAssistantAvailability =
  | { mode: "ALWAYS" }
  | {
      mode: "CUSTOM";
      timeZone: string;
      days: number[];
      start: string;
      end: string;
    };

export const DEFAULT_OWNER_ASSISTANT_AVAILABILITY: OwnerAssistantAvailability = {
  mode: "ALWAYS",
};

export function parseOwnerAssistantAvailability(value: unknown): OwnerAssistantAvailability {
  if (!value || typeof value !== "object") return DEFAULT_OWNER_ASSISTANT_AVAILABILITY;
  const raw = value as Record<string, unknown>;
  if (raw.mode !== "CUSTOM") return DEFAULT_OWNER_ASSISTANT_AVAILABILITY;
  const days = Array.isArray(raw.days)
    ? raw.days.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    : [];
  const start = typeof raw.start === "string" && /^\d{2}:\d{2}$/.test(raw.start) ? raw.start : "08:00";
  const end = typeof raw.end === "string" && /^\d{2}:\d{2}$/.test(raw.end) ? raw.end : "18:00";
  const timeZone = typeof raw.timeZone === "string" && raw.timeZone.trim() ? raw.timeZone.trim() : "America/Denver";
  return { mode: "CUSTOM", timeZone, days: [...new Set(days)], start, end };
}

export function isOwnerAssistantAvailable(value: unknown, now = new Date()) {
  const schedule = parseOwnerAssistantAvailability(value);
  if (schedule.mode === "ALWAYS") return true;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: schedule.timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday ?? "");
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? -1);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? -1);
  const current = hour * 60 + minute;
  const toMinutes = (text: string) => {
    const [h, m] = text.split(":").map(Number);
    return h * 60 + m;
  };
  return schedule.days.includes(day) && current >= toMinutes(schedule.start) && current < toMinutes(schedule.end);
}
