import type { Division, HousecallProMigrationStepType } from "@prisma/client";
import type { HousecallProClient } from "@/lib/housecall-pro/client";

export type MigrationOptions = {
  batchSize?: number;
  defaultDivision?: Division;
  throttleMs?: number;
  /** HCP org / CRM company names — never copy onto Customer.companyName */
  excludeCompanyNames?: string[];
  /**
   * When true, each step imports a single record then completes.
   * Used to smoke-test the full migration pipeline without pulling production volume.
   */
  debugMode?: boolean;
};

export type BatchCounters = {
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
};

/** One pulled/imported item captured for debug-mode UI. */
export type MigrationDebugSample = {
  at: string;
  action: "pulled" | "created" | "updated" | "skipped" | "failed" | "info";
  label: string;
  hcpId?: string | null;
  detail?: Record<string, unknown> | string | null;
  error?: string | null;
  /** Public/download URL for attachment preview in the debug UI. */
  previewUrl?: string | null;
  previewMimeType?: string | null;
};

export type BatchResult = BatchCounters & {
  done: boolean;
  cursor: string | null;
  errors: string[];
  /** Present when options.debugMode — samples of what HCP returned / how import went. */
  debugSamples?: MigrationDebugSample[];
};

export type ImportContext = {
  companyId: string;
  migrationId: string;
  step: HousecallProMigrationStepType;
  cursor: string | null;
  batchSize: number;
  options: MigrationOptions;
  client: HousecallProClient;
  adminUserId: string;
};

export type PreviewCounts = {
  tags?: number;
  serviceZones?: number;
  employees?: number;
  materialCategories?: number;
  materials?: number;
  services?: number;
  customers?: number;
  jobs?: number;
  estimates?: number;
  invoices?: number;
  connected?: boolean;
  companyName?: string;
};

export type HcpRecord = Record<string, unknown>;

export type PaginatedFetchResult<T> = {
  items: T[];
  nextCursor: string | null;
  totalEstimate?: number;
};
