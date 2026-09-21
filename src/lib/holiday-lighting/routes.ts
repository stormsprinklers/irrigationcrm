export type HolidayEstimateWizardParams = {
  customerId?: string | null;
  customerName?: string | null;
  propertyId?: string | null;
  visitId?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

export function holidayEstimateWizardUrl(params: HolidayEstimateWizardParams = {}) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value.trim()) {
      searchParams.set(key, value);
    }
  }

  const query = searchParams.toString();
  return `/holiday-lighting/quote/new${query ? `?${query}` : ""}`;
}
