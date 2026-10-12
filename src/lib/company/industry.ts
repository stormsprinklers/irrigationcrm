export type CompanyIndustry = { name?: string | null; companyName?: string | null; holidayLightingFeaturesEnabled?: boolean | null; irrigationFeaturesEnabled?: boolean | null };
export function isHolidayLightingCompany(company: CompanyIndustry | null | undefined): boolean {
  const name = (company?.name ?? company?.companyName ?? "").toLowerCase().replace(/&/g, "and").replace(/\s+/g, " ").trim();
  return name === "chestnut and cheer" || (company?.holidayLightingFeaturesEnabled === true && company.irrigationFeaturesEnabled === false);
}
export function companyAIName(name: string) { return `${name.trim().split(/\s+/)[0] || "Company"} AI`; }
