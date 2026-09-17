import { NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse, forbiddenResponse } from "@/lib/api-auth";
import { canManageCustomers } from "@/lib/customers/permissions";
import { createHousecallProClient } from "@/lib/housecall-pro/client";
import type { HcpRecord } from "@/lib/housecall-pro/types";
import { hcpCustomerName } from "@/lib/housecall-pro/importers/customers";
import { hcpId, hcpString, hcpTags, primaryAddressFromHcpRecord, hcpAddressRecords, addressFromRecord } from "@/lib/housecall-pro/utils";
import { importCustomerRow } from "@/lib/customers/import-customers";

export const maxDuration = 60;

function values(input: unknown, keys: string[]) {
  if (!Array.isArray(input)) return [];
  return input.map((item) => {
    if (typeof item === "string") return item;
    if (!item || typeof item !== "object") return "";
    const record = item as HcpRecord;
    return keys.map((key) => hcpString(record[key])).find(Boolean) ?? "";
  }).filter(Boolean);
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    if (!canManageCustomers(user.role)) return forbiddenResponse();
    const body = await request.json().catch(() => ({}));
    const cursor = body.cursor == null ? null : String(body.cursor);
    if (cursor && (cursor.length > 1000 || (!/^\d+$/.test(cursor) && !cursor.startsWith("https://api.housecallpro.com/")))) {
      return NextResponse.json({ error: "Invalid Housecall Pro page" }, { status: 400 });
    }
    const client = createHousecallProClient();
    const page = await client.getPaginated("/customers", { cursor, pageSize: 20, arrayKeys: ["customers"] });
    const results = [];
    for (const listRecord of page.items) {
      const id = hcpId(listRecord);
      if (!id) { results.push({ action: "skipped", reason: "HCP customer has no ID", name: hcpCustomerName(listRecord) }); continue; }
      let record = listRecord;
      if (!primaryAddressFromHcpRecord(record)) {
        try {
          const detail = await client.get<HcpRecord>(`/customers/${encodeURIComponent(id)}`);
          record = { ...record, ...((detail.customer as HcpRecord | undefined) ?? detail) };
        } catch { /* list data is still usable */ }
      }
      const primary = primaryAddressFromHcpRecord(record);
      try {
        const imported = await importCustomerRow(user.companyId, {
          hcpId: id, name: hcpCustomerName(record),
          email: hcpString(record.email), emails: values(record.email_addresses ?? record.emails, ["email", "address"]),
          phone: hcpString(record.phone) ?? hcpString(record.mobile_number), phones: values(record.phone_numbers, ["phone", "number"]),
          address: primary?.address, city: primary?.city, state: primary?.state, zip: primary?.zip,
          tags: hcpTags(record), archived: record.archived === true,
          properties: hcpAddressRecords(record).map((property, index) => ({
            hcpId: hcpId(property) || `${id}-property-${index}`,
            name: hcpString(property.name) ?? (index === 0 ? "Primary" : `Property ${index + 1}`),
            ...addressFromRecord(property),
          })),
        });
        results.push({ ...imported, name: hcpCustomerName(record) });
      } catch (error) {
        console.error("Housecall Pro customer import row failed", error);
        results.push({ action: "skipped", name: hcpCustomerName(record), reason: "Could not save this row" });
      }
    }
    return NextResponse.json({ results, nextCursor: page.nextCursor, totalEstimate: page.totalEstimate ?? null });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return unauthorizedResponse();
    return NextResponse.json({ error: error instanceof Error ? error.message : "Housecall Pro import failed" }, { status: 500 });
  }
}
