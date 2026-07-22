import type { ExpenseCard, ExpenseCardRolePolicy, UserRole } from "@prisma/client";

/** Storm default MCC allowlist: fuel, auto service/parts, hardware/suppliers. */
export const DEFAULT_ALLOWED_CATEGORIES = [
  "service_stations",
  "automated_fuel_dispensers",
  "automotive_parts_and_accessories_stores",
  "automotive_service_shops",
  "car_and_truck_dealers_parts_and_service",
  "hardware_stores",
  "home_supply_warehouse_stores",
  "miscellaneous_specialty_retail",
] as const;

export type ExpenseCardControls = {
  dailyLimitCents: number;
  monthlyLimitCents: number;
  blockAtm: boolean;
  blockInternational: boolean;
  blockOnline: boolean;
  allowedCategories: string[];
};

export type ExpenseCardDefaultsJson = Partial<ExpenseCardControls> & {
  enabled?: boolean;
};

export const PROGRAM_DEFAULTS: ExpenseCardControls = {
  dailyLimitCents: 15_000, // $150
  monthlyLimitCents: 150_000, // $1,500
  blockAtm: true,
  blockInternational: true,
  blockOnline: true,
  allowedCategories: [...DEFAULT_ALLOWED_CATEGORIES],
};

export function parseCompanyDefaults(raw: unknown): ExpenseCardControls {
  const data = (raw && typeof raw === "object" ? raw : {}) as ExpenseCardDefaultsJson;
  return {
    dailyLimitCents:
      typeof data.dailyLimitCents === "number" && data.dailyLimitCents >= 0
        ? Math.round(data.dailyLimitCents)
        : PROGRAM_DEFAULTS.dailyLimitCents,
    monthlyLimitCents:
      typeof data.monthlyLimitCents === "number" && data.monthlyLimitCents >= 0
        ? Math.round(data.monthlyLimitCents)
        : PROGRAM_DEFAULTS.monthlyLimitCents,
    blockAtm: data.blockAtm ?? PROGRAM_DEFAULTS.blockAtm,
    blockInternational: data.blockInternational ?? PROGRAM_DEFAULTS.blockInternational,
    blockOnline: data.blockOnline ?? PROGRAM_DEFAULTS.blockOnline,
    allowedCategories:
      Array.isArray(data.allowedCategories) && data.allowedCategories.length
        ? data.allowedCategories.map(String)
        : [...PROGRAM_DEFAULTS.allowedCategories],
  };
}

type OverrideSlice = {
  dailyLimitCents?: number | null;
  monthlyLimitCents?: number | null;
  blockAtm?: boolean | null;
  blockInternational?: boolean | null;
  blockOnline?: boolean | null;
  allowedCategories?: string[] | null;
};

/**
 * Resolve effective controls: employee override → role policy → company defaults.
 */
export function resolveEffectiveControls(params: {
  companyDefaults: unknown;
  rolePolicy: ExpenseCardRolePolicy | null | undefined;
  card: Pick<
    ExpenseCard,
    | "dailyLimitCents"
    | "monthlyLimitCents"
    | "blockAtm"
    | "blockInternational"
    | "blockOnline"
    | "allowedCategories"
  > | null | undefined;
}): ExpenseCardControls {
  const base = parseCompanyDefaults(params.companyDefaults);
  const role = params.rolePolicy;
  const card = params.card;

  const merge = (layer: OverrideSlice | null | undefined, current: ExpenseCardControls) => {
    if (!layer) return current;
    return {
      dailyLimitCents:
        layer.dailyLimitCents != null ? layer.dailyLimitCents : current.dailyLimitCents,
      monthlyLimitCents:
        layer.monthlyLimitCents != null ? layer.monthlyLimitCents : current.monthlyLimitCents,
      blockAtm: layer.blockAtm != null ? layer.blockAtm : current.blockAtm,
      blockInternational:
        layer.blockInternational != null ? layer.blockInternational : current.blockInternational,
      blockOnline: layer.blockOnline != null ? layer.blockOnline : current.blockOnline,
      allowedCategories:
        layer.allowedCategories && layer.allowedCategories.length
          ? layer.allowedCategories
          : current.allowedCategories,
    };
  };

  return merge(card, merge(role, base));
}

export const EXPENSE_CARD_ROLES: UserRole[] = [
  "TECH",
  "MANAGER",
  "INSTALLER",
  "CSR",
  "SALES",
  "ADMIN",
];

export function centsToDollars(cents: number) {
  return Math.round(cents) / 100;
}

export function dollarsToCents(dollars: number) {
  return Math.round(dollars * 100);
}
