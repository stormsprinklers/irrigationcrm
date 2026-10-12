import { isHolidayLightingCompany, type CompanyIndustry } from "./industry";
/** Company-level irrigation tools pack (Rachio, maps, programming, suppliers, portal irrigation). */

export function irrigationFeaturesEnabled(
  company: CompanyIndustry | null | undefined
) {
  return !isHolidayLightingCompany(company) && company?.irrigationFeaturesEnabled !== false;
}

/** Settings nav hrefs that belong to the irrigation tools pack. */
export const IRRIGATION_SETTINGS_HREFS = new Set([
  "/settings/integrations/rachio",
  "/settings/parts-suppliers",
]);

/** Company-level holiday lighting tools pack (quoter, catalog). */
export function holidayLightingFeaturesEnabled(
  company: CompanyIndustry | null | undefined
) {
  return isHolidayLightingCompany(company) || company?.holidayLightingFeaturesEnabled === true;
}

export const HOLIDAY_LIGHTING_NAV_HREFS = new Set([
  "/holiday-lighting/quote",
  "/settings/holiday-lighting",
]);

export const WINTERIZATION_NAV_HREFS = new Set(["/winterization"]);

/** Company-level maintenance plans pack (templates, enrollments, billing, portal plans). */
export function maintenancePlansFeaturesEnabled(
  company: CompanyIndustry & { maintenancePlansFeaturesEnabled?: boolean | null } | null | undefined
) {
  return !isHolidayLightingCompany(company) && company?.maintenancePlansFeaturesEnabled !== false;
}

export const MAINTENANCE_PLANS_NAV_HREFS = new Set([
  "/maintenance-plans",
]);

/** Enrollment statuses that count as an active customer plan. */
export const ACTIVE_MAINTENANCE_ENROLLMENT_STATUSES = [
  "ACTIVE",
  "PENDING_RENEWAL",
  "RENEWED",
  "EXPIRING_SOON",
] as const;
