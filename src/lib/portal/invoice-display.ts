import type { InvoiceStatus } from "@prisma/client";

export type PortalInvoiceDisplay = {
  balanceDue: number;
  isPayable: boolean;
  statusLabel: "Paid" | "Refunded" | "Void" | "Due";
};

const NON_PAYABLE_STATUSES: InvoiceStatus[] = ["PAID", "REFUNDED", "VOID", "DRAFT"];

export function getPortalInvoiceDisplay(params: {
  status: string;
  balanceDue: number;
}): PortalInvoiceDisplay {
  const balanceDue = Math.max(0, params.balanceDue);

  if (params.status === "REFUNDED") {
    return { balanceDue, isPayable: false, statusLabel: "Refunded" };
  }
  if (params.status === "VOID") {
    return { balanceDue, isPayable: false, statusLabel: "Void" };
  }
  if (params.status === "PAID" || balanceDue <= 0) {
    return { balanceDue, isPayable: false, statusLabel: "Paid" };
  }
  if (NON_PAYABLE_STATUSES.includes(params.status as InvoiceStatus)) {
    return { balanceDue, isPayable: false, statusLabel: "Paid" };
  }

  return { balanceDue, isPayable: true, statusLabel: "Due" };
}
