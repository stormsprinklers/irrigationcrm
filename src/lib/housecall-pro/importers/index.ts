import type { BatchResult, ImportContext } from "@/lib/housecall-pro/types";
import { importTagsBatch } from "@/lib/housecall-pro/importers/tags";
import { importServiceZonesBatch } from "@/lib/housecall-pro/importers/service-zones";
import { importEmployeesBatch } from "@/lib/housecall-pro/importers/employees";
import { importMaterialCategoriesBatch } from "@/lib/housecall-pro/importers/material-categories";
import { importMaterialsBatch } from "@/lib/housecall-pro/importers/materials";
import { importServicesBatch } from "@/lib/housecall-pro/importers/services";
import { importCustomersBatch } from "@/lib/housecall-pro/importers/customers";
import {
  importCustomerAttachmentsBatch,
  importEstimateAttachmentsBatch,
  importJobAttachmentsBatch,
} from "@/lib/housecall-pro/importers/attachments";
import { importJobsBatch } from "@/lib/housecall-pro/importers/jobs";
import { importEstimatesBatch } from "@/lib/housecall-pro/importers/estimates";
import { importInvoicesBatch } from "@/lib/housecall-pro/importers/invoices";
import { importScheduleWindowsBatch } from "@/lib/housecall-pro/importers/schedule-windows";
import { HousecallProMigrationStepType } from "@prisma/client";

const IMPORTERS: Partial<
  Record<HousecallProMigrationStepType, (ctx: ImportContext) => Promise<BatchResult>>
> = {
  [HousecallProMigrationStepType.TAGS]: importTagsBatch,
  [HousecallProMigrationStepType.SERVICE_ZONES]: importServiceZonesBatch,
  [HousecallProMigrationStepType.EMPLOYEES]: importEmployeesBatch,
  [HousecallProMigrationStepType.MATERIAL_CATEGORIES]: importMaterialCategoriesBatch,
  [HousecallProMigrationStepType.MATERIALS]: importMaterialsBatch,
  [HousecallProMigrationStepType.PRICE_BOOK_SERVICES]: importServicesBatch,
  [HousecallProMigrationStepType.CUSTOMERS]: importCustomersBatch,
  [HousecallProMigrationStepType.CUSTOMER_ATTACHMENTS]: importCustomerAttachmentsBatch,
  [HousecallProMigrationStepType.JOBS]: importJobsBatch,
  [HousecallProMigrationStepType.JOB_ATTACHMENTS]: importJobAttachmentsBatch,
  [HousecallProMigrationStepType.ESTIMATES]: importEstimatesBatch,
  [HousecallProMigrationStepType.ESTIMATE_ATTACHMENTS]: importEstimateAttachmentsBatch,
  [HousecallProMigrationStepType.INVOICES]: importInvoicesBatch,
  [HousecallProMigrationStepType.SCHEDULE_WINDOWS]: importScheduleWindowsBatch,
};

export async function runStepBatch(ctx: ImportContext): Promise<BatchResult> {
  const importer = IMPORTERS[ctx.step];
  if (!importer) {
    return {
      done: true,
      cursor: null,
      processed: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      errors: [],
    };
  }
  return importer(ctx);
}
