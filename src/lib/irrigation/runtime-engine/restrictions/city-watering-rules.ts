import type { DayOfWeekCode } from "../types";
import {
  addressParityFromAddress,
  type AddressParity,
} from "./address-parity";

export type SundayPolicy = "allowed" | "limited" | "prohibited" | "saturday_only";

export type ScheduleMode = "days_of_week" | "odd_calendar_dates" | "even_calendar_dates";

export type CityScheduleSlot = {
  mode: ScheduleMode;
  /** Weekday schedule when mode is days_of_week. */
  daysOfWeek?: DayOfWeekCode[];
};

export type CityWateringRule = {
  city: string;
  aliases?: string[];
  odd: CityScheduleSlot;
  even: CityScheduleSlot;
  sundayPolicy: SundayPolicy;
  notes: string[];
};

export type ResolvedCitySchedule = {
  city: string;
  parity: AddressParity;
  mode: ScheduleMode;
  /** Effective weekday list after Sunday policy (empty for calendar-date modes). */
  daysOfWeek: DayOfWeekCode[];
  sundayPolicy: SundayPolicy;
  notes: string[];
};

const WEEKDAY_ORDER: DayOfWeekCode[] = [
  "SUN",
  "MON",
  "TUE",
  "WED",
  "THU",
  "FRI",
  "SAT",
];

/** Utah cities with odd/even address (or calendar-date) watering restrictions. */
export const CITY_WATERING_RULES: CityWateringRule[] = [
  {
    city: "Alpine",
    odd: { mode: "days_of_week", daysOfWeek: ["MON", "WED", "FRI"] },
    even: { mode: "days_of_week", daysOfWeek: ["TUE", "THU", "SAT"] },
    sundayPolicy: "prohibited",
    notes: ["Water 7 PM–7 AM only."],
  },
  {
    city: "American Fork",
    odd: { mode: "days_of_week", daysOfWeek: ["MON", "WED", "FRI"] },
    even: { mode: "days_of_week", daysOfWeek: ["SUN", "TUE", "THU"] },
    sundayPolicy: "limited",
    notes: [
      "City recommends using only 2 of the 3 assigned days during drought.",
      "Sunday watering is limited.",
    ],
  },
  {
    city: "Eagle Mountain",
    odd: { mode: "odd_calendar_dates" },
    even: { mode: "even_calendar_dates" },
    sundayPolicy: "allowed",
    notes: ["Temporary restriction during system repairs: odd/even calendar dates."],
  },
  {
    city: "Highland",
    odd: { mode: "days_of_week", daysOfWeek: ["TUE", "THU", "SAT"] },
    even: { mode: "days_of_week", daysOfWeek: ["MON", "WED", "FRI"] },
    sundayPolicy: "prohibited",
    notes: ["Standard parity schedule; Sunday watering is not allowed."],
  },
  {
    city: "Mapleton",
    odd: { mode: "odd_calendar_dates" },
    even: { mode: "even_calendar_dates" },
    sundayPolicy: "allowed",
    notes: ["No sprinklers 10 AM–6 PM."],
  },
  {
    city: "Payson",
    odd: { mode: "days_of_week", daysOfWeek: ["MON", "WED", "FRI"] },
    even: { mode: "days_of_week", daysOfWeek: ["TUE", "THU", "SAT"] },
    sundayPolicy: "prohibited",
    notes: ["Standard parity schedule; Sunday watering is not allowed."],
  },
  {
    city: "Pleasant Grove",
    odd: { mode: "days_of_week", daysOfWeek: ["MON", "WED", "FRI"] },
    // Official even list includes Sunday; sundayPolicy remaps weekend to Saturday only.
    even: { mode: "days_of_week", daysOfWeek: ["SUN", "TUE", "THU"] },
    sundayPolicy: "saturday_only",
    notes: ["Sunday watering is not allowed; use Saturday instead of Sunday."],
  },
];

function normalizeCityName(city: string): string {
  return city
    .trim()
    .toLowerCase()
    .replace(/,/g, " ")
    .replace(/\s+city$/i, "")
    .replace(/\s+/g, " ");
}

const CITY_RULE_INDEX = (() => {
  const map = new Map<string, CityWateringRule>();
  for (const rule of CITY_WATERING_RULES) {
    map.set(normalizeCityName(rule.city), rule);
    for (const alias of rule.aliases ?? []) {
      map.set(normalizeCityName(alias), rule);
    }
  }
  return map;
})();

export function lookupCityWateringRule(
  city: string | null | undefined
): CityWateringRule | null {
  if (!city?.trim()) return null;
  return CITY_RULE_INDEX.get(normalizeCityName(city)) ?? null;
}

function applySundayPolicy(
  days: DayOfWeekCode[],
  sundayPolicy: SundayPolicy
): DayOfWeekCode[] {
  if (sundayPolicy === "allowed" || sundayPolicy === "limited") {
    return [...days];
  }

  const withoutSunday = days.filter((day) => day !== "SUN");
  if (sundayPolicy === "saturday_only" && days.includes("SUN")) {
    if (!withoutSunday.includes("SAT")) {
      withoutSunday.push("SAT");
    }
  }

  return sortDays(withoutSunday);
}

function sortDays(days: DayOfWeekCode[]): DayOfWeekCode[] {
  const rank = new Map(WEEKDAY_ORDER.map((day, index) => [day, index]));
  return [...new Set(days)].sort(
    (a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0)
  );
}

export function scheduleModeLabel(mode: ScheduleMode, parity: AddressParity): string {
  if (mode === "odd_calendar_dates") return "Odd calendar dates";
  if (mode === "even_calendar_dates") return "Even calendar dates";
  return parity === "odd" ? "Odd address days" : "Even address days";
}

/**
 * Resolve the compliant watering schedule for a property address + city.
 * Returns null when the city has no parity rules or the street number cannot be parsed.
 */
export function resolveCityAddressSchedule(params: {
  city?: string | null;
  address?: string | null;
}): ResolvedCitySchedule | null {
  const rule = lookupCityWateringRule(params.city);
  if (!rule) return null;

  const parity = addressParityFromAddress(params.address);
  if (!parity) return null;

  const slot = parity === "odd" ? rule.odd : rule.even;
  const rawDays = slot.daysOfWeek ?? [];
  const daysOfWeek =
    slot.mode === "days_of_week"
      ? applySundayPolicy(rawDays, rule.sundayPolicy)
      : [];

  return {
    city: rule.city,
    parity,
    mode: slot.mode,
    daysOfWeek,
    sundayPolicy: rule.sundayPolicy,
    notes: [...rule.notes],
  };
}

/**
 * Pick watering days from a city-assigned set, capped by how many days/week the zone needs.
 * Drought mode should pass daysNeeded=2 (use 2 of the 3 assigned days).
 */
export function pickDaysFromAssigned(
  assignedDays: DayOfWeekCode[],
  daysNeeded: number
): DayOfWeekCode[] {
  if (daysNeeded <= 0) return [];
  if (assignedDays.length === 0) return [];
  return assignedDays.slice(0, Math.min(daysNeeded, assignedDays.length));
}
