import {
  Division,
  EmployeeStatus,
  EstimateStatus,
  InvoiceStatus,
  UserRole,
  VisitStatus,
} from "@prisma/client";
import type { HcpRecord } from "@/lib/housecall-pro/types";
import { slugify } from "@/lib/price-book/queries";

export function hcpId(record: HcpRecord): string {
  const id = record.id ?? record.uuid;
  return id != null ? String(id) : "";
}

export function hcpString(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

export function hcpMoney(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  const cents = Number(value);
  if (Number.isFinite(cents) && String(value).length <= 6 && cents > 1000) {
    return cents / 100;
  }
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function hcpTags(record: HcpRecord): string[] {
  const tags = record.tags;
  if (!Array.isArray(tags)) return [];
  return tags.map((t) => String(t).trim()).filter(Boolean);
}

export function mapVisitStatus(workStatus: unknown): VisitStatus {
  const status = String(workStatus ?? "").toLowerCase();
  if (status.includes("complete")) return VisitStatus.COMPLETED;
  if (status.includes("cancel")) return VisitStatus.CANCELLED;
  if (status.includes("progress")) return VisitStatus.IN_PROGRESS;
  if (status.includes("way") || status.includes("route")) return VisitStatus.EN_ROUTE;
  if (status.includes("pause")) return VisitStatus.PAUSED;
  if (status.includes("unsched")) return VisitStatus.UNSCHEDULED;
  return VisitStatus.SCHEDULED;
}

export function mapEstimateStatus(record: HcpRecord, hasLinkedJob: boolean): EstimateStatus {
  const status = String(record.status ?? record.work_status ?? "").toLowerCase();
  const options = Array.isArray(record.options) ? record.options : [];
  const approved = options.some(
    (o) =>
      typeof o === "object" &&
      o &&
      String((o as HcpRecord).approval_status ?? "").toLowerCase().includes("approv")
  );
  if (hasLinkedJob || approved) return EstimateStatus.CONVERTED;
  if (status.includes("declin")) return EstimateStatus.DECLINED;
  if (status.includes("expir")) return EstimateStatus.EXPIRED;
  if (status.includes("approv")) return EstimateStatus.APPROVED;
  if (status.includes("sent")) return EstimateStatus.SENT;
  return EstimateStatus.DRAFT;
}

export function mapInvoiceStatus(record: HcpRecord): InvoiceStatus {
  const status = String(record.status ?? "").toLowerCase();
  if (status.includes("void")) return InvoiceStatus.VOID;
  if (status.includes("refund")) return InvoiceStatus.REFUNDED;
  if (status.includes("partial")) return InvoiceStatus.PARTIAL;
  if (status.includes("paid")) return InvoiceStatus.PAID;
  if (status.includes("sent")) return InvoiceStatus.SENT;
  return InvoiceStatus.DRAFT;
}

export function mapEmployeeRole(role: unknown): UserRole {
  const value = String(role ?? "").toLowerCase();
  if (value.includes("admin") || value.includes("owner")) return UserRole.ADMIN;
  if (value.includes("manager")) return UserRole.MANAGER;
  if (value.includes("tech") || value.includes("field")) return UserRole.TECH;
  return UserRole.CSR;
}

export function mapEmployeeStatus(record: HcpRecord): EmployeeStatus {
  const archived =
    record.archived === true ||
    String(record.status ?? "").toLowerCase().includes("archiv") ||
    String(record.status ?? "").toLowerCase().includes("inactive");
  return archived ? EmployeeStatus.ARCHIVED : EmployeeStatus.ACTIVE;
}

export function mapDivision(value: unknown, fallback: Division): Division {
  const text = String(value ?? "").toUpperCase();
  if (text.includes("INSTALL")) return Division.INSTALL;
  if (text.includes("SERVICE")) return Division.SERVICE;
  return fallback;
}

export function uniqueSlug(base: string, existing: Set<string>) {
  let slug = slugify(base) || "item";
  let candidate = slug;
  let i = 2;
  while (existing.has(candidate)) {
    candidate = `${slug}-${i}`;
    i++;
  }
  existing.add(candidate);
  return candidate;
}

export function hcpDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function hcpCreatedAt(record: HcpRecord): Date | null {
  return (
    hcpDate(record.created_at) ??
    hcpDate(record.createdAt) ??
    hcpDate(record.date_created)
  );
}

export type ParsedAddress = {
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

export function isEmptyParsedAddress(addr: ParsedAddress): boolean {
  return !addr.address && !addr.city && !addr.state && !addr.zip;
}

export function addressFromRecord(record: HcpRecord): ParsedAddress {
  const nested =
    (record.address as HcpRecord | undefined) ??
    (record.service_address as HcpRecord | undefined) ??
    (record.billing_address as HcpRecord | undefined) ??
    (record.location as HcpRecord | undefined);

  const source = nested ?? record;
  const line1 = hcpString(
    source.street ?? source.street_line_1 ?? source.address ?? source.line1 ?? source.line_1
  );
  const line2 = hcpString(
    source.street_line_2 ?? source.line2 ?? source.street_line2 ?? source.unit
  );
  const address = [line1, line2].filter(Boolean).join(", ") || null;

  return {
    address,
    city: hcpString(source.city ?? source.locality),
    state: hcpString(source.state ?? source.region ?? source.province),
    zip: hcpString(source.zip ?? source.postal_code ?? source.zip_code),
  };
}

function addressTypeRank(record: HcpRecord): number {
  const type = hcpString(record.type)?.toLowerCase();
  if (type === "service") return 0;
  if (type === "billing") return 1;
  return 2;
}

export function hcpAddressRecords(record: HcpRecord): HcpRecord[] {
  const records: HcpRecord[] = [];
  if (Array.isArray(record.addresses)) records.push(...(record.addresses as HcpRecord[]));
  if (Array.isArray(record.properties)) records.push(...(record.properties as HcpRecord[]));

  const withData = records.filter((entry) => !isEmptyParsedAddress(addressFromRecord(entry)));
  if (withData.length) {
    return [...withData].sort((a, b) => addressTypeRank(a) - addressTypeRank(b));
  }

  const top = addressFromRecord(record);
  if (!isEmptyParsedAddress(top)) {
    return [{ ...record, name: "Primary", type: "service" }];
  }

  return [];
}

export function primaryAddressFromHcpRecord(record: HcpRecord): ParsedAddress | null {
  const records = hcpAddressRecords(record);
  if (records.length) return addressFromRecord(records[0]);
  const top = addressFromRecord(record);
  return isEmptyParsedAddress(top) ? null : top;
}

export function hasHcpAddressData(record: HcpRecord): boolean {
  return primaryAddressFromHcpRecord(record) != null;
}

export function lineItemsFromRecord(record: HcpRecord): HcpRecord[] {
  const keys = ["line_items", "items", "services", "materials"];
  for (const key of keys) {
    if (Array.isArray(record[key])) return record[key] as HcpRecord[];
  }
  return [];
}

export function pickEstimateOption(record: HcpRecord): HcpRecord | null {
  const options = Array.isArray(record.options) ? (record.options as HcpRecord[]) : [];
  if (!options.length) return null;
  const approved = options.find((o) =>
    String(o.approval_status ?? "").toLowerCase().includes("approv")
  );
  return approved ?? options[0];
}
