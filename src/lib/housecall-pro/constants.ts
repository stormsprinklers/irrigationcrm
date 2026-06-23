import { HousecallProMigrationStepType } from "@prisma/client";

export const HCP_BASE_URL = "https://api.housecallpro.com";

export const HCP_ATTACHMENT_PATHS = {
  customers: (id: string) => [
    `/customers/${id}/attachments`,
    `/customer/${id}/attachments`,
    `/api/customers/${id}/attachments`,
  ],
  jobs: (id: string) => [
    `/jobs/${id}/attachments`,
    `/job/${id}/attachments`,
    `/api/jobs/${id}/attachments`,
  ],
  estimates: (id: string) => [
    `/estimates/${id}/attachments`,
    `/estimate/${id}/attachments`,
    `/api/estimates/${id}/attachments`,
  ],
} as const;

export const HCP_PARENT_DETAIL_PATHS = {
  customers: (id: string) => [`/customers/${id}`, `/customer/${id}`],
  jobs: (id: string) => [`/jobs/${id}`, `/job/${id}`],
  estimates: (id: string) => [`/estimates/${id}`, `/estimate/${id}`],
} as const;

/** Price book endpoints live under /api/price_book/ (not /v1/ or /pricebook/v1/). */
export const HCP_PATHS = {
  materialCategories: ["/api/price_book/material_categories"],
  materials: ["/api/price_book/materials"],
  services: ["/api/price_book/services"],
  invoices: ["/api/invoices", "/invoices"],
} as const;

export const DEFAULT_BATCH_SIZE = 200;
export const HCP_MAX_PAGE_SIZE = 200;
export const ATTACHMENT_BATCH_SIZE = 10;
export const DEFAULT_THROTTLE_MS = 750;
export const MAX_429_RETRIES = 5;

export const FALLBACK_SERVICE_AREA_SLUG = "imported-unzoned";
export const FALLBACK_SERVICE_AREA_NAME = "Imported — Unzoned";

export const MIGRATION_STEP_ORDER: HousecallProMigrationStepType[] = [
  HousecallProMigrationStepType.CONNECT,
  HousecallProMigrationStepType.TAGS,
  HousecallProMigrationStepType.SERVICE_ZONES,
  HousecallProMigrationStepType.EMPLOYEES,
  HousecallProMigrationStepType.MATERIAL_CATEGORIES,
  HousecallProMigrationStepType.MATERIALS,
  HousecallProMigrationStepType.PRICE_BOOK_SERVICES,
  HousecallProMigrationStepType.CUSTOMERS,
  HousecallProMigrationStepType.CUSTOMER_ATTACHMENTS,
  HousecallProMigrationStepType.JOBS,
  HousecallProMigrationStepType.JOB_ATTACHMENTS,
  HousecallProMigrationStepType.ESTIMATES,
  HousecallProMigrationStepType.ESTIMATE_ATTACHMENTS,
  HousecallProMigrationStepType.INVOICES,
  HousecallProMigrationStepType.SCHEDULE_WINDOWS,
];

export const STEP_LABELS: Record<HousecallProMigrationStepType, string> = {
  CONNECT: "Connect & preview",
  TAGS: "Tags",
  SERVICE_ZONES: "Service zones",
  EMPLOYEES: "Employees",
  MATERIAL_CATEGORIES: "Material categories",
  MATERIALS: "Materials",
  PRICE_BOOK_SERVICES: "Price book services",
  CUSTOMERS: "Customers",
  CUSTOMER_ATTACHMENTS: "Customer attachments",
  JOBS: "Jobs (visits)",
  JOB_ATTACHMENTS: "Job attachments",
  ESTIMATES: "Estimates",
  ESTIMATE_ATTACHMENTS: "Estimate attachments",
  INVOICES: "Invoices",
  SCHEDULE_WINDOWS: "Schedule windows",
};

export function nextStep(
  current: HousecallProMigrationStepType
): HousecallProMigrationStepType | null {
  const index = MIGRATION_STEP_ORDER.indexOf(current);
  if (index < 0 || index >= MIGRATION_STEP_ORDER.length - 1) return null;
  return MIGRATION_STEP_ORDER[index + 1];
}
