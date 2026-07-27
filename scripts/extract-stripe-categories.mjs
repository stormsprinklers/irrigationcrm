import fs from "fs";

const path =
  "C:/Users/jgree/.cursor/projects/c-Users-jgree-OneDrive-Desktop-STORM-SPRINKLERS-APPS/agent-tools/e704ea05-b3d8-471a-8da9-725568b6f732.txt";
const text = fs.readFileSync(path, "utf8");
const m = text.match(
  /cardholder\.spending_controls\.allowed_categories[\s\S]*?Possible enum values:\n((?: - `[a-z0-9_]+`\n)+)/
);
if (!m) {
  console.error("no match");
  process.exit(1);
}
const cats = [...m[1].matchAll(/`([a-z0-9_]+)`/g)].map((x) => x[1]);
console.log("count", cats.length);

const ts = `/**
 * Stripe Issuing merchant categories for spending_controls.allowed_categories /
 * blocked_categories.
 * Source: https://docs.stripe.com/api/issuing/cards/object (spending_controls.allowed_categories)
 * Extracted ${new Date().toISOString().slice(0, 10)}.
 */
export const STRIPE_ISSUING_CATEGORIES = ${JSON.stringify(cats, null, 2)} as const;

export type StripeIssuingCategory = (typeof STRIPE_ISSUING_CATEGORIES)[number];

export const STRIPE_ISSUING_CATEGORY_SET = new Set<string>(STRIPE_ISSUING_CATEGORIES);

/** Human labels for common field-service categories (fallback: prettified slug). */
const LABEL_OVERRIDES: Partial<Record<StripeIssuingCategory, string>> = {
  service_stations: "Service stations (gas)",
  automated_fuel_dispensers: "Automated fuel dispensers",
  auto_service_shops: "Auto service shops",
  automotive_parts_and_accessories_stores: "Automotive parts stores",
  automotive_tire_stores: "Tire stores",
  auto_and_home_supply_stores: "Auto & home supply stores",
  hardware_stores: "Hardware stores",
  home_supply_warehouse_stores: "Home supply warehouse stores",
  hardware_equipment_and_supplies: "Hardware equipment & supplies",
  lumber_building_materials_stores: "Lumber & building materials",
  construction_materials: "Construction materials",
  industrial_supplies: "Industrial supplies",
  plumbing_heating_equipment_and_supplies: "Plumbing & heating supplies",
  heating_plumbing_a_c: "Heating / plumbing / A/C",
  electrical_parts_and_equipment: "Electrical parts & equipment",
  nurseries_lawn_and_garden_supply_stores: "Nurseries & garden supply",
  landscaping_services: "Landscaping services",
  miscellaneous_specialty_retail: "Miscellaneous specialty retail",
  wholesale_clubs: "Wholesale clubs",
  miscellaneous_repair_shops: "Miscellaneous repair shops",
  special_trade_services: "Special trade services",
  motor_vehicle_supplies_and_new_parts: "Motor vehicle supplies",
  fuel_dealers_non_automotive: "Fuel dealers (non-automotive)",
  petroleum_and_petroleum_products: "Petroleum products",
};

export function stripeCategoryLabel(category: string): string {
  const override = LABEL_OVERRIDES[category as StripeIssuingCategory];
  if (override) return override;
  return category
    .split("_")
    .map((w) => (w.length ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** Drop unknown values; used before sending to Stripe. */
export function sanitizeStripeCategories(categories: string[]): StripeIssuingCategory[] {
  const out: StripeIssuingCategory[] = [];
  const seen = new Set<string>();
  for (const raw of categories) {
    const c = String(raw).trim();
    if (!c || seen.has(c)) continue;
    if (!STRIPE_ISSUING_CATEGORY_SET.has(c)) continue;
    seen.add(c);
    out.push(c as StripeIssuingCategory);
  }
  return out;
}

/**
 * Map legacy / fabricated CRM category strings onto Stripe's enum.
 * Unknown values are dropped by sanitizeStripeCategories.
 */
export const LEGACY_CATEGORY_ALIASES: Record<string, StripeIssuingCategory> = {
  automotive_service_shops: "auto_service_shops",
  car_and_truck_dealers_parts_and_service: "motor_vehicle_supplies_and_new_parts",
};

export function normalizeStripeCategories(categories: string[]): StripeIssuingCategory[] {
  return sanitizeStripeCategories(
    categories.map((c) => LEGACY_CATEGORY_ALIASES[c] ?? c)
  );
}
`;

fs.writeFileSync("src/lib/expense-cards/stripe-categories.ts", ts);
console.log("wrote src/lib/expense-cards/stripe-categories.ts");
