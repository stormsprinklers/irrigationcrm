export type InvoiceDTO = {
  id: string;
  invoiceNumber: string;
  status: string;
  subtotal: number;
  discountTotal: number;
  tax: number;
  total: number;
  paidAt: string | null;
  sentAt: string | null;
  publicToken: string;
  createdAt: string;
  updatedAt: string;
  customer: { id: string; name: string; phone: string | null; email: string | null };
  visit: { id: string; title: string } | null;
  estimate: { id: string; status: string } | null;
  maintenancePlanEnrollment: {
    id: string;
    planName: string;
  } | null;
  lineItems: Array<{
    id: string;
    name: string;
    description: string | null;
    quantity: number;
    unitPrice: number;
    total: number;
    sortOrder: number;
  }>;
  payments: Array<{
    id: string;
    amount: number;
    method: string;
    paidAt: string;
    refundedAt: string | null;
  }>;
  amountPaid: number;
  balanceDue: number;
};

export type PublicInvoiceDTO = Pick<
  InvoiceDTO,
  | "invoiceNumber"
  | "status"
  | "subtotal"
  | "discountTotal"
  | "tax"
  | "total"
  | "paidAt"
  | "createdAt"
  | "lineItems"
  | "amountPaid"
  | "balanceDue"
> & {
  companyName: string;
  customerName: string;
};
