import type { VisitStatus } from "@prisma/client";
import { toNumber } from "@/lib/visits/totals";
import { getPortalInvoiceDisplay } from "./invoice-display";

/** Portal visit payload — internal visit notes are intentionally excluded. */
export function serializePortalVisit(visit: {
  id: string;
  title: string;
  status: VisitStatus;
  startAt: Date | null;
  endAt: Date | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  assignedUser?: { name: string; photoUrl: string | null; title: string | null } | null;
  property?: {
    id: string;
    name: string;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  } | null;
}) {
  return {
    id: visit.id,
    title: visit.title,
    status: visit.status,
    startAt: visit.startAt?.toISOString() ?? null,
    endAt: visit.endAt?.toISOString() ?? null,
    address: visit.address,
    city: visit.city,
    state: visit.state,
    zip: visit.zip,
    technician: visit.assignedUser
      ? {
          name: visit.assignedUser.name,
          photoUrl: visit.assignedUser.photoUrl,
          title: visit.assignedUser.title,
        }
      : null,
    property: visit.property
      ? {
          id: visit.property.id,
          name: visit.property.name,
          address: visit.property.address,
          city: visit.property.city,
          state: visit.property.state,
          zip: visit.property.zip,
        }
      : null,
  };
}

export function serializePortalInvoice(invoice: {
  id: string;
  invoiceNumber: string;
  status: string;
  total: { toNumber?: () => number } | number;
  publicToken: string;
  createdAt: Date;
  paidAt: Date | null;
  payments: Array<{ amount: { toNumber?: () => number } | number; refundedAt: Date | null }>;
}) {
  const total = typeof invoice.total === "number" ? invoice.total : toNumber(invoice.total as never);
  const amountPaid = invoice.payments.reduce((sum, p) => {
    if (p.refundedAt) return sum;
    const amt = typeof p.amount === "number" ? p.amount : toNumber(p.amount as never);
    return sum + amt;
  }, 0);

  const balanceDue = Math.max(0, total - amountPaid);
  const display = getPortalInvoiceDisplay({ status: invoice.status, balanceDue });

  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    total,
    amountPaid,
    balanceDue: display.balanceDue,
    isPayable: display.isPayable,
    statusLabel: display.statusLabel,
    publicToken: invoice.publicToken,
    createdAt: invoice.createdAt.toISOString(),
    paidAt: invoice.paidAt?.toISOString() ?? null,
  };
}

export function serializePortalEstimate(estimate: {
  id: string;
  publicToken: string;
  status: string;
  estimateNumber?: string | null;
  selectedOptionId?: string | null;
  total: { toNumber?: () => number } | number;
  subtotal: { toNumber?: () => number } | number;
  discountTotal: { toNumber?: () => number } | number;
  expiresAt: Date | null;
  signedAt: Date | null;
  signatureBlobUrl: string | null;
  createdAt: Date;
  depositRequired?: boolean;
  depositType?: string | null;
  depositAmount?: { toNumber?: () => number } | number | null;
  designProjectId?: string | null;
  premiumOptionTotal?: { toNumber?: () => number } | number | null;
  selectedQuoteTier?: string | null;
  options?: Array<{
    id: string;
    letter: string | null;
    label: string;
    sortOrder: number;
    subtotal: { toNumber?: () => number } | number;
    discountTotal: { toNumber?: () => number } | number;
    total: { toNumber?: () => number } | number;
  }>;
  lineItems: Array<{
    optionId?: string | null;
    name: string;
    description: string | null;
    quantity: { toNumber?: () => number } | number;
    unitPrice: { toNumber?: () => number } | number;
    unit?: string | null;
    total: { toNumber?: () => number } | number;
    sortOrder: number;
    priceBookItem?: { type: string } | null;
  }>;
  discounts?: Array<{
    optionId?: string | null;
    label: string | null;
    type: string;
    amount: { toNumber?: () => number } | number;
  }>;
  visit?: {
    id: string;
    title: string;
    startAt: Date | null;
    endAt: Date | null;
    assignedUser?: { name: string; photoUrl: string | null; title: string | null } | null;
  } | null;
  company?: { estimateWarrantyText?: string | null } | null;
}) {
  const hasDesign = Boolean(estimate.designProjectId);
  const optionCount = estimate.options?.length ?? 0;
  const options = (estimate.options ?? []).map((option) => {
    const letter = option.letter;
    const base = estimate.estimateNumber?.trim() || "EST";
    const displayNumber = optionCount <= 1 ? base : `${base}${letter || "A"}`;
    return {
      id: option.id,
      letter: option.letter,
      label: option.label,
      sortOrder: option.sortOrder,
      subtotal: toNumber(option.subtotal as never),
      discountTotal: toNumber(option.discountTotal as never),
      total: toNumber(option.total as never),
      displayNumber,
    };
  });

  const lineItems = estimate.lineItems.map((item) => ({
    optionId: item.optionId ?? null,
    name: item.name,
    description: item.description,
    quantity: toNumber(item.quantity as never),
    unitPrice: toNumber(item.unitPrice as never),
    unit: item.unit?.trim() || "each",
    total: toNumber(item.total as never),
    sortOrder: item.sortOrder,
    itemType: item.priceBookItem?.type ?? "SERVICE",
  }));

  const discounts = (estimate.discounts ?? []).map((d) => ({
    optionId: d.optionId ?? null,
    label: d.label,
    type: d.type,
    amount: toNumber(d.amount as never),
  }));

  const visit = estimate.visit
    ? {
        id: estimate.visit.id,
        title: estimate.visit.title,
        startAt: estimate.visit.startAt?.toISOString() ?? null,
        endAt: estimate.visit.endAt?.toISOString() ?? null,
        technician: estimate.visit.assignedUser
          ? {
              name: estimate.visit.assignedUser.name,
              photoUrl: estimate.visit.assignedUser.photoUrl,
              title: estimate.visit.assignedUser.title,
            }
          : null,
      }
    : null;

  return {
    id: estimate.id,
    estimateNumber: estimate.estimateNumber ?? null,
    publicToken: estimate.publicToken,
    status: estimate.status,
    selectedOptionId: estimate.selectedOptionId ?? options[0]?.id ?? null,
    subtotal: toNumber(estimate.subtotal as never),
    discountTotal: toNumber(estimate.discountTotal as never),
    total: toNumber(estimate.total as never),
    expiresAt: estimate.expiresAt?.toISOString() ?? null,
    signedAt: estimate.signedAt?.toISOString() ?? null,
    signatureBlobUrl: estimate.signatureBlobUrl,
    createdAt: estimate.createdAt.toISOString(),
    depositRequired: estimate.depositRequired ?? false,
    depositType: estimate.depositType ?? null,
    depositAmount:
      estimate.depositAmount != null ? toNumber(estimate.depositAmount as never) : null,
    hasDesign,
    designProjectId: estimate.designProjectId ?? null,
    premiumOptionTotal:
      estimate.premiumOptionTotal != null
        ? toNumber(estimate.premiumOptionTotal as never)
        : null,
    selectedQuoteTier: estimate.selectedQuoteTier ?? null,
    options,
    lineItems,
    discounts,
    visit,
    warrantyText: estimate.company?.estimateWarrantyText?.trim() || null,
  };
}

export function serializePortalProperty(property: {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  isPrimary: boolean;
  propertyDiagramUrl: string | null;
}) {
  return {
    id: property.id,
    name: property.name,
    address: property.address,
    city: property.city,
    state: property.state,
    zip: property.zip,
    isPrimary: property.isPrimary,
    propertyDiagramUrl: property.propertyDiagramUrl,
  };
}
