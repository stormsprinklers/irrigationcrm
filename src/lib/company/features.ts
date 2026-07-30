/** Company-level irrigation tools pack (Rachio, maps, programming, suppliers, portal irrigation). */

export function irrigationFeaturesEnabled(
  company: { irrigationFeaturesEnabled?: boolean | null } | null | undefined
) {
  return company?.irrigationFeaturesEnabled !== false;
}

/** Settings nav hrefs that belong to the irrigation tools pack. */
export const IRRIGATION_SETTINGS_HREFS = new Set([
  "/settings/integrations/rachio",
  "/settings/parts-suppliers",
]);

/** Company-level holiday lighting tools pack (quoter, catalog). */
export function holidayLightingFeaturesEnabled(
  company: { holidayLightingFeaturesEnabled?: boolean | null } | null | undefined
) {
  return company?.holidayLightingFeaturesEnabled === true;
}

export const HOLIDAY_LIGHTING_NAV_HREFS = new Set([
  "/holiday-lighting/quote",
  "/settings/holiday-lighting",
]);
