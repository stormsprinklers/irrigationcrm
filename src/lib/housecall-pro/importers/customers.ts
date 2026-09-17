import { emptyBatchResult, pushDebug, pushEntityDebug, summarizeHcpRecord } from "@/lib/housecall-pro/debug";
import type { BatchResult, ImportContext, HcpRecord } from "@/lib/housecall-pro/types";
import {
  hcpCreatedAt, hcpCustomerCompanyName, hcpId, hcpString, hcpTags,
  primaryAddressFromHcpRecord, hasHcpAddressData, hcpAddressRecords, addressFromRecord,
} from "@/lib/housecall-pro/utils";
import { importCustomerRow } from "@/lib/customers/import-customers";
import { validCustomerName } from "@/lib/customers/import-matching";
import { prisma } from "@/lib/prisma";

export function hcpCustomerName(record: HcpRecord) {
  const fullName = [hcpString(record.first_name), hcpString(record.last_name)].filter(Boolean).join(" ");
  return [hcpString(record.name), fullName, hcpString(record.display_name)]
    .find((candidate) => validCustomerName(candidate)) ?? "";
}

async function enrichCustomerRecord(ctx: ImportContext, record: HcpRecord, id: string): Promise<HcpRecord> {
  if (hcpCreatedAt(record) && hasHcpAddressData(record)) return record;
  try {
    const detail = await ctx.client.get<HcpRecord>(`/customers/${encodeURIComponent(id)}`);
    const customer = ((detail.customer as HcpRecord | undefined) ?? detail) as HcpRecord;
    return { ...record, ...customer };
  } catch {
    return record;
  }
}

function contactValues(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    if (typeof entry === "string") return entry;
    if (entry && typeof entry === "object") {
      const item = entry as HcpRecord;
      return hcpString(item.email) ?? hcpString(item.address) ?? hcpString(item.phone) ?? hcpString(item.number) ?? "";
    }
    return "";
  }).filter(Boolean);
}

export async function importCustomersBatch(ctx: ImportContext): Promise<BatchResult> {
  const debugEnabled = Boolean(ctx.options.debugMode);
  const result = emptyBatchResult(ctx.cursor);
  const page = await ctx.client.getPaginated("/customers", {
    cursor: ctx.cursor, pageSize: ctx.batchSize, arrayKeys: ["customers"],
  });
  pushDebug(result, {
    action: "pulled", label: `HCP returned ${page.items.length} customer(s)`,
    detail: { nextCursor: page.nextCursor, totalEstimate: page.totalEstimate ?? null, sample: page.items.slice(0, 3).map((r) => summarizeHcpRecord(r as HcpRecord)) },
  }, { enabled: debugEnabled });
  if (page.totalEstimate != null && !ctx.cursor) {
    await prisma.housecallProMigrationStep.updateMany({
      where: { migrationId: ctx.migrationId, step: ctx.step }, data: { totalEstimate: page.totalEstimate },
    });
  }
  for (const listRecord of page.items) {
    result.processed++;
    const id = hcpId(listRecord);
    if (!id) { result.skipped++; continue; }
    const record = await enrichCustomerRecord(ctx, listRecord, id);
    const name = hcpCustomerName(record);
    if (!validCustomerName(name)) {
      result.skipped++;
      pushEntityDebug(result, { enabled: debugEnabled, action: "skipped", kind: "Customer", record, fields: { reason: "Missing or invalid name" } });
      continue;
    }
    const primary = primaryAddressFromHcpRecord(record);
    try {
      const imported = await importCustomerRow(ctx.companyId, {
        name, hcpId: id, migrationId: ctx.migrationId, createdAt: hcpCreatedAt(record) ?? undefined,
        email: hcpString(record.email), emails: contactValues(record.email_addresses ?? record.emails),
        phone: hcpString(record.phone) ?? hcpString(record.mobile_number), phones: contactValues(record.phone_numbers),
        address: primary?.address, city: primary?.city, state: primary?.state, zip: primary?.zip,
        companyName: hcpCustomerCompanyName(record, name, ctx.options.excludeCompanyNames ?? []),
        tags: hcpTags(record), archived: record.archived === true,
        properties: hcpAddressRecords(record).map((property, index) => ({
          hcpId: hcpId(property) || `${id}-property-${index}`,
          name: hcpString(property.name) ?? (index === 0 ? "Primary" : `Property ${index + 1}`),
          ...addressFromRecord(property),
        })),
      });
      if (imported.action === "created") result.created++;
      else if (imported.action === "merged") result.updated++;
      else result.skipped++;
      pushEntityDebug(result, {
        enabled: debugEnabled, action: imported.action === "merged" ? "updated" : imported.action,
        kind: "Customer", record, fields: { name, localId: imported.customerId, reason: imported.reason },
      });
    } catch (error) {
      result.failed++;
      const message = error instanceof Error ? error.message : "Customer import failed";
      result.errors.push(message);
      pushEntityDebug(result, { enabled: debugEnabled, action: "failed", kind: "Customer", record, fields: { name }, error: message });
    }
  }
  result.cursor = page.nextCursor;
  result.done = !page.nextCursor;
  return result;
}
