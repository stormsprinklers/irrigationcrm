import { InvoiceStatus } from "@prisma/client";
import { customerFacingEstimateLines } from "@/lib/estimates/customer-facing-lines";
import { getInvoiceForCompany } from "@/lib/invoices/queries";
import {
  resolveEstimateInvoiceBalance,
  type EstimateInvoiceAmountSelection,
} from "@/lib/invoices/estimate-invoice-amount";
import { prisma } from "@/lib/prisma";
import { nextInvoiceNumber } from "@/lib/visits/queries";
import { computeTotals, sumDiscounts, sumLineItems, toNumber } from "@/lib/visits/totals";
import { createPublicCapability } from "@/lib/security/public-capability";

const OPEN_INVOICE_STATUSES = [
  InvoiceStatus.DRAFT,
  InvoiceStatus.SENT,
  InvoiceStatus.PARTIAL,
] as const;

function isApprovalPaymentInvoice(invoiceNumber: string) {
  return invoiceNumber.includes("-DEP-") || invoiceNumber.includes("-PAY-");
}

export async function getEstimateInvoiceAvailability(params: {
  companyId: string;
  estimateId: string;
}) {
  const estimate = await prisma.estimate.findFirst({
    where: {
      id: params.estimateId,
      companyId: params.companyId,
      status: { in: ["APPROVED", "CONVERTED"] },
    },
    select: {
      total: true,
      invoices: {
        select: {
          payments: { select: { amount: true, refundedAt: true } },
        },
      },
    },
  });
  if (!estimate) {
    return { ok: false as const, error: "Approved estimate not found", status: 404 };
  }

  const estimateTotal = toNumber(estimate.total);
  const paid = estimate.invoices.reduce(
    (invoiceSum, invoice) =>
      invoiceSum +
      invoice.payments.reduce(
        (paymentSum, payment) =>
          payment.refundedAt ? paymentSum : paymentSum + toNumber(payment.amount),
        0
      ),
    0
  );
  const remainingBalance = Math.max(
    0,
    Math.round((estimateTotal - paid) * 100) / 100
  );

  return {
    ok: true as const,
    estimateTotal,
    paid: Math.round(paid * 100) / 100,
    remainingBalance,
  };
}

export async function syncEstimateInvoice(params: {
  companyId: string;
  estimateId: string;
  amountSelection?: EstimateInvoiceAmountSelection;
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
    (invoice) => !isApprovalPaymentInvoice(invoice.invoiceNumber)
  );
  const unpaidApprovalInvoice = openInvoices.find(
    (invoice) =>
      isApprovalPaymentInvoice(invoice.invoiceNumber) &&
      invoice.payments.every((payment) => payment.refundedAt || toNumber(payment.amount) <= 0)
  );
  const existing = normalInvoice ?? unpaidApprovalInvoice ?? null;
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
  const candidatePaid =
    existing?.payments.reduce(
      (sum, payment) => (payment.refundedAt ? sum : sum + toNumber(payment.amount)),
      0
    ) ?? 0;
  const remainingBalance = Math.max(
    0,
    Math.round((estimateTotal - priorPaid - candidatePaid) * 100) / 100
  );
  const resolvedAmount = resolveEstimateInvoiceBalance(
    remainingBalance,
    params.amountSelection
  );
  if (!resolvedAmount.ok) {
    return { ok: false as const, error: resolvedAmount.error, status: 400 };
  }
  const invoiceTotal = Math.round((candidatePaid + resolvedAmount.amount) * 100) / 100;
  const fullRemainingInvoiceTotal = Math.round((estimateTotal - priorPaid) * 100) / 100;
  const isPartialInvoice = invoiceTotal < fullRemainingInvoiceTotal;
  const invoiceNumber =
    existing && !isApprovalPaymentInvoice(existing.invoiceNumber)
      ? existing.invoiceNumber
      : await nextInvoiceNumber(params.companyId);
  const lineItems = isPartialInvoice
    ? [
        {
          name: "Progress invoice",
          description: `Partial invoice for estimate ${estimate.estimateNumber ?? estimate.id}`,
          quantity: 1,
          unitPrice: invoiceTotal,
          total: invoiceTotal,
          sortOrder: 0,
        },
      ]
    : [
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
            subtotal: isPartialInvoice ? invoiceTotal : Math.max(0, subtotal - priorPaid),
            discountTotal: isPartialInvoice ? 0 : discountTotal,
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
            ...createPublicCapability(),
            companyId: estimate.companyId,
            customerId: estimate.customerId,
            estimateId: estimate.id,
            invoiceNumber,
            status: InvoiceStatus.DRAFT,
            subtotal: isPartialInvoice ? invoiceTotal : Math.max(0, subtotal - priorPaid),
            discountTotal: isPartialInvoice ? 0 : discountTotal,
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
