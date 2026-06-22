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

export function hcpDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
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

export function addressFromRecord(record: HcpRecord) {
  const address =
    (record.address as HcpRecord | undefined) ??
    (record.service_address as HcpRecord | undefined) ??
    record;
  return {
    address: hcpString(address.street ?? address.street_line_1 ?? address.address),
    city: hcpString(address.city),
    state: hcpString(address.state),
    zip: hcpString(address.zip ?? address.postal_code),
  };
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
