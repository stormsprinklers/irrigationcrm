import { InvoiceStatus } from "@prisma/client";
import { customerFacingEstimateLines } from "@/lib/estimates/customer-facing-lines";
import { getInvoiceForCompany } from "@/lib/invoices/queries";
import { prisma } from "@/lib/prisma";
import { nextInvoiceNumber } from "@/lib/visits/queries";
import { computeTotals, sumDiscounts, sumLineItems, toNumber } from "@/lib/visits/totals";

const OPEN_INVOICE_STATUSES = [
  InvoiceStatus.DRAFT,
  InvoiceStatus.SENT,
  InvoiceStatus.PARTIAL,
] as const;

export async function syncEstimateInvoice(params: {
  companyId: string;
  estimateId: string;
}) {
  const estimate = await prisma.estimate.findFirst({
    where: {
      id: params.estimateId,
      companyId: params.companyId,
      status: { in: ["APPROVED", "CONVERTED"] },
    },
    include: {
      options: { orderBy: { sortOrder: "asc" } },
      lineItems: { orderBy: { sortOrder: "asc" } },
      discounts: true,
      invoices: {
        include: { payments: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!estimate) {
    return { ok: false as const, error: "Approved estimate not found", status: 404 };
  }

  const optionId = estimate.selectedOptionId ?? estimate.options[0]?.id ?? null;
  const selectedItems = optionId
    ? estimate.lineItems.filter((item) => item.optionId === optionId || !item.optionId)
    : estimate.lineItems;
  const selectedDiscounts = optionId
    ? estimate.discounts.filter((discount) => discount.optionId === optionId || !discount.optionId)
    : estimate.discounts;
  if (!selectedItems.length) {
    return { ok: false as const, error: "The selected option has no line items", status: 400 };
  }

  const visibleItems = customerFacingEstimateLines(
    selectedItems.map((item) => ({
      ...item,
      quantity: toNumber(item.quantity),
      unitPrice: toNumber(item.unitPrice),
      total: toNumber(item.total),
    }))
  );
  const subtotal = sumLineItems(selectedItems);
  const discountTotal = sumDiscounts(subtotal, selectedDiscounts);
  const estimateTotal = computeTotals(subtotal, discountTotal).total;

  const openInvoices = estimate.invoices.filter((invoice) =>
    OPEN_INVOICE_STATUSES.includes(invoice.status as (typeof OPEN_INVOICE_STATUSES)[number])
  );
  const normalInvoice = openInvoices.find(
    (invoice) => !invoice.invoiceNumber.includes("-DEP-")
  );
  const unpaidDepositInvoice = openInvoices.find(
    (invoice) =>
      invoice.invoiceNumber.includes("-DEP-") &&
      invoice.payments.every((payment) => payment.refundedAt || toNumber(payment.amount) <= 0)
  );
  const existing = normalInvoice ?? unpaidDepositInvoice ?? null;
  const priorPaid = estimate.invoices.reduce((sum, invoice) => {
    if (invoice.id === existing?.id) return sum;
    return (
      sum +
      invoice.payments.reduce(
        (paymentSum, payment) =>
          payment.refundedAt ? paymentSum : paymentSum + toNumber(payment.amount),
        0
      )
    );
  }, 0);
  const invoiceTotal = Math.max(0, Math.round((estimateTotal - priorPaid) * 100) / 100);
  if (invoiceTotal <= 0) {
    return { ok: false as const, error: "This estimate is already paid", status: 400 };
  }

  const candidatePaid =
    existing?.payments.reduce(
      (sum, payment) => (payment.refundedAt ? sum : sum + toNumber(payment.amount)),
      0
    ) ?? 0;
  if (invoiceTotal - candidatePaid <= 0) {
    return { ok: false as const, error: "This estimate is already paid", status: 400 };
  }
  const invoiceNumber =
    existing && !existing.invoiceNumber.includes("-DEP-")
      ? existing.invoiceNumber
      : await nextInvoiceNumber(params.companyId);
  const lineItems = [
    ...visibleItems.map((item, index) => ({
      name: item.name,
      description: item.description,
      // Customer invoices show a packaged price, never estimate footage/rates.
      quantity: 1,
      unitPrice: item.total,
      total: item.total,
      sortOrder: index,
    })),
    ...(priorPaid > 0
      ? [
          {
            name: "Previous payment",
            description: "Deposit or payment already received.",
            quantity: 1,
            unitPrice: -priorPaid,
            total: -priorPaid,
            sortOrder: visibleItems.length,
          },
        ]
      : []),
  ];

  const invoice = await prisma.$transaction(async (tx) => {
    const saved = existing
      ? await tx.invoice.update({
          where: { id: existing.id },
          data: {
            invoiceNumber,
            status: candidatePaid > 0 ? InvoiceStatus.PARTIAL : InvoiceStatus.DRAFT,
            subtotal: Math.max(0, subtotal - priorPaid),
            discountTotal,
            total: invoiceTotal,
            sentAt: null,
            lineItems: {
              deleteMany: {},
              create: lineItems,
            },
          },
        })
      : await tx.invoice.create({
          data: {
            companyId: estimate.companyId,
            customerId: estimate.customerId,
            estimateId: estimate.id,
            invoiceNumber,
            status: InvoiceStatus.DRAFT,
            subtotal: Math.max(0, subtotal - priorPaid),
            discountTotal,
            total: invoiceTotal,
            lineItems: { create: lineItems },
          },
        });

    await tx.invoice.updateMany({
      where: {
        estimateId: estimate.id,
        id: { not: saved.id },
        status: { in: [...OPEN_INVOICE_STATUSES] },
        payments: { none: {} },
      },
      data: { status: InvoiceStatus.VOID },
    });
    return saved;
  });

  const serialized = await getInvoiceForCompany(params.companyId, invoice.id);
  if (!serialized) {
    return { ok: false as const, error: "Invoice could not be loaded", status: 500 };
  }
  return { ok: true as const, invoice: serialized };
}
