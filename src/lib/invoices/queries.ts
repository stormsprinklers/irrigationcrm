import { InvoiceStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/visits/totals";
import type { InvoiceDTO, PublicInvoiceDTO } from "./types";

export const invoiceInclude = {
  customer: { select: { id: true, name: true, phone: true, email: true, doNotService: true } },
  visit: { select: { id: true, title: true } },
  estimate: { select: { id: true, status: true } },
  lineItems: { orderBy: { sortOrder: "asc" as const } },
  payments: { orderBy: { paidAt: "desc" as const } },
  maintenanceBillingPeriods: {
    take: 1,
    orderBy: { dueDate: "desc" as const },
    select: {
      enrollment: {
        select: {
          id: true,
          template: { select: { name: true } },
        },
      },
    },
  },
} satisfies Prisma.InvoiceInclude;

type InvoicePayload = Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>;

function computeAmountPaid(payments: InvoicePayload["payments"]) {
  return payments.reduce((sum, payment) => {
    if (payment.refundedAt) return sum;
    return sum + toNumber(payment.amount);
  }, 0);
}

export function serializeInvoice(invoice: InvoicePayload): InvoiceDTO {
  const amountPaid = computeAmountPaid(invoice.payments);
  const total = toNumber(invoice.total);
  const enrollment = invoice.maintenanceBillingPeriods[0]?.enrollment ?? null;

  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    subtotal: toNumber(invoice.subtotal),
    discountTotal: toNumber(invoice.discountTotal),
    tax: toNumber(invoice.tax),
    total,
    paidAt: invoice.paidAt?.toISOString() ?? null,
    sentAt: invoice.sentAt?.toISOString() ?? null,
    publicToken: invoice.publicToken,
    createdAt: invoice.createdAt.toISOString(),
    updatedAt: invoice.updatedAt.toISOString(),
    customer: invoice.customer,
    visit: invoice.visit,
    estimate: invoice.estimate,
    maintenancePlanEnrollment: enrollment
      ? { id: enrollment.id, planName: enrollment.template.name }
      : null,
    lineItems: invoice.lineItems.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      quantity: toNumber(item.quantity),
      unitPrice: toNumber(item.unitPrice),
      total: toNumber(item.total),
      sortOrder: item.sortOrder,
    })),
    payments: invoice.payments.map((p) => ({
      id: p.id,
      amount: toNumber(p.amount),
      method: p.method,
      paidAt: p.paidAt.toISOString(),
      refundedAt: p.refundedAt?.toISOString() ?? null,
    })),
    amountPaid,
    balanceDue: Math.max(0, total - amountPaid),
  };
}

export function serializePublicInvoice(
  invoice: InvoicePayload & { company: { name: string } }
): PublicInvoiceDTO {
  const serialized = serializeInvoice(invoice);
  return {
    companyName: invoice.company.name,
    customerName: invoice.customer.name,
    invoiceNumber: serialized.invoiceNumber,
    status: serialized.status,
    subtotal: serialized.subtotal,
    discountTotal: serialized.discountTotal,
    tax: serialized.tax,
    total: serialized.total,
    paidAt: serialized.paidAt,
    createdAt: serialized.createdAt,
    lineItems: serialized.lineItems,
    amountPaid: serialized.amountPaid,
    balanceDue: serialized.balanceDue,
  };
}

export async function listInvoices(
  companyId: string,
  filters?: { customerId?: string; status?: string; search?: string }
) {
  const where: Prisma.InvoiceWhereInput = { companyId };

  if (filters?.customerId) where.customerId = filters.customerId;
  if (filters?.status) where.status = filters.status as Prisma.EnumInvoiceStatusFilter["equals"];

  if (filters?.search?.trim()) {
    const q = filters.search.trim();
    where.OR = [
      { invoiceNumber: { contains: q, mode: "insensitive" } },
      { customer: { name: { contains: q, mode: "insensitive" } } },
    ];
  }

  const invoices = await prisma.invoice.findMany({
    where,
    include: invoiceInclude,
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  return invoices.map(serializeInvoice);
}

/** Open invoice AR: remaining balance on every non-paid, non-void invoice (including drafts). */
export async function getOutstandingReceivables(
  companyId: string,
  filters?: { customerId?: string }
) {
  const invoices = await prisma.invoice.findMany({
    where: {
      companyId,
      status: { notIn: [InvoiceStatus.PAID, InvoiceStatus.REFUNDED, InvoiceStatus.VOID] },
      ...(filters?.customerId ? { customerId: filters.customerId } : {}),
    },
    select: {
      id: true,
      invoiceNumber: true,
      status: true,
      total: true,
      createdAt: true,
      customer: { select: { id: true, name: true } },
      payments: { select: { amount: true, refundedAt: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const rows = invoices
    .map((invoice) => {
      const total = toNumber(invoice.total);
      const amountPaid = invoice.payments.reduce((sum, payment) => {
        if (payment.refundedAt) return sum;
        return sum + toNumber(payment.amount);
      }, 0);
      const balanceDue = Math.max(0, Math.round((total - amountPaid) * 100) / 100);
      return {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
        customer: invoice.customer,
        total,
        amountPaid: Math.round(amountPaid * 100) / 100,
        balanceDue,
        createdAt: invoice.createdAt.toISOString(),
      };
    })
    .filter((row) => row.balanceDue > 0);

  const totalOutstanding =
    Math.round(rows.reduce((sum, row) => sum + row.balanceDue, 0) * 100) / 100;
  const largest = [...rows].sort((a, b) => b.balanceDue - a.balanceDue).slice(0, 25);

  return {
    totalOutstanding,
    invoiceCount: rows.length,
    invoices: largest,
  };
}

export async function getInvoiceForCompany(companyId: string, invoiceId: string) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, companyId },
    include: invoiceInclude,
  });
  return invoice ? serializeInvoice(invoice) : null;
}

export async function getPublicInvoiceByToken(token: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { publicToken: token },
    include: { ...invoiceInclude, company: { select: { name: true } } },
  });
  return invoice ? serializePublicInvoice(invoice) : null;
}
