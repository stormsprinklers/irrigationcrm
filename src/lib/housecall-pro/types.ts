import type { Division, HousecallProMigrationStepType } from "@prisma/client";
import type { HousecallProClient } from "@/lib/housecall-pro/client";

export type MigrationOptions = {
  batchSize?: number;
  defaultDivision?: Division;
  throttleMs?: number;
};

export type BatchCounters = {
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
};

export type BatchResult = BatchCounters & {
  done: boolean;
  cursor: string | null;
  errors: string[];
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
