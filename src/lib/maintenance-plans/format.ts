import type { EnrollmentStatus } from "@prisma/client";

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

export type PlanStatusDisplay = {
  status: EnrollmentStatus;
  label: string;
  count: number;
  color: string;
};

const STATUS_META: Record<EnrollmentStatus, { label: string; color: string }> = {
  DRAFT: { label: "Draft", color: "bg-gray-400" },
  SENT: { label: "Sent", color: "bg-blue-400" },
  ACTIVE: { label: "Active", color: "bg-green-500" },
  PENDING_RENEWAL: { label: "Pending renewal", color: "bg-sky-400" },
  RENEWED: { label: "Renewed", color: "bg-green-700" },
  EXPIRING_SOON: { label: "Expiring soon", color: "bg-yellow-400" },
  EXPIRED: { label: "Expired", color: "bg-pink-400" },
  CANCELLED: { label: "Cancelled", color: "bg-red-400" },
};

export function enrollmentStatusesToDisplay(
  statuses: Array<{ status: EnrollmentStatus; count: number }>
): PlanStatusDisplay[] {
  const order: EnrollmentStatus[] = [
    "DRAFT",
    "SENT",
    "PENDING_RENEWAL",
    "ACTIVE",
    "RENEWED",
    "EXPIRING_SOON",
    "EXPIRED",
    "CANCELLED",
  ];

  return order
    .map((status) => {
      const row = statuses.find((s) => s.status === status);
      const meta = STATUS_META[status];
      return {
        status,
        label: meta.label,
        count: row?.count ?? 0,
        color: meta.color,
      };
    })
    .filter((s) => s.count > 0 || ["DRAFT", "SENT", "ACTIVE"].includes(s.status));
}

export type BillingRowDisplay = {
  id: string;
  enrollmentId?: string;
  customer: string;
  phone: string | null;
  dueDate: string;
  status: string;
  amount: number;
};

export function formatBillingStatus(status: string) {
  switch (status) {
    case "DUE":
      return "Due soon";
    case "FAILED":
      return "Failed";
    case "PAID":
      return "Paid";
    default:
      return status.charAt(0) + status.slice(1).toLowerCase();
  }
}

export const BILLING_FREQUENCY_LABELS: Record<string, string> = {
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  ANNUAL: "Annual",
  MULTI_YEAR_UPFRONT: "Multi-year upfront",
};
