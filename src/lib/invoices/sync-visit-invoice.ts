import { prisma } from "@/lib/prisma";
import { getInvoiceForCompany } from "@/lib/invoices/queries";
import { getInvoicePayUrl } from "@/lib/invoices/pay-url";
import { nextInvoiceNumber } from "@/lib/visits/queries";
import { computeTotals, sumDiscounts, sumLineItems, toNumber } from "@/lib/visits/totals";
import { createPublicCapability } from "@/lib/security/public-capability";

export type SyncVisitInvoiceResult =
  | {
      ok: true;
      invoiceId: string;
      balanceDue: number;
      payLink: string;
      invoice: NonNullable<Awaited<ReturnType<typeof getInvoiceForCompany>>>;
    }
  | { ok: false; error: string; status: number };

function isApprovalPaymentInvoice(invoiceNumber: string) {
  return invoiceNumber.includes("-DEP-") || invoiceNumber.includes("-PAY-");
}

export async function syncVisitInvoice(params: {
  companyId: string;
  visitId: string;
}): Promise<SyncVisitInvoiceResult> {
  const visit = await prisma.visit.findFirst({
    where: { id: params.visitId, companyId: params.companyId },
    include: {
      customer: true,
      lineItems: { orderBy: { sortOrder: "asc" } },
      discounts: true,
    },
  });

  if (!visit) return { ok: false, error: "Visit not found", status: 404 };
  if (!visit.customerId || !visit.customer) {
    return { ok: false, error: "Visit must have a customer to create an invoice", status: 400 };
  }
  if (!visit.lineItems.length) {
    return { ok: false, error: "Add line items before creating an invoice", status: 400 };
  }

  const subtotal = sumLineItems(visit.lineItems);
  const discountTotal = sumDiscounts(subtotal, visit.discounts);
  const { total } = computeTotals(subtotal, discountTotal);

  if (total <= 0) {
    return { ok: false, error: "Visit total must be greater than zero", status: 400 };
  }

  const visitInvoices = await prisma.invoice.findMany({
    where: {
      visitId: visit.id,
      companyId: params.companyId,
    },
    orderBy: { createdAt: "desc" },
    include: { payments: true },
  });

  const paidAmount = (inv: (typeof visitInvoices)[number]) => {
    const recorded = inv.payments.reduce((sum, payment) => {
      if (payment.refundedAt) return sum;
      return sum + toNumber(payment.amount);
    }, 0);
    return recorded > 0 || inv.status !== "PAID" ? recorded : toNumber(inv.total);
  };

  let invoice = visitInvoices.find(
    (candidate) =>
      !isApprovalPaymentInvoice(candidate.invoiceNumber) &&
      ["DRAFT", "SENT", "PARTIAL"].includes(candidate.status)
  );
  const priorPaid = visitInvoices.reduce((sum, candidate) => {
    if (candidate.id === invoice?.id || candidate.status === "VOID") return sum;
    return sum + paidAmount(candidate);
  }, 0);
  const invoiceTotal = Math.max(0, total - priorPaid);
  const invoicePayments = invoice ? paidAmount(invoice) : 0;

  if (invoiceTotal - invoicePayments <= 0.005) {
    return { ok: false, error: "This visit is already paid", status: 400 };
  }

  const invoiceLineItems = [
    ...visit.lineItems.map((item, index) => ({
      name: item.name,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: item.total,
      sortOrder: index,
    })),
    ...(priorPaid > 0
      ? [{
          name: "Previous payment",
          description: "Deposit or payment already received",
          quantity: 1,
          unitPrice: -priorPaid,
          total: -priorPaid,
          sortOrder: visit.lineItems.length,
        }]
      : []),
  ];

  if (!invoice) {
    const created = await prisma.invoice.create({
      data: {
        ...createPublicCapability(),
        companyId: params.companyId,
        customerId: visit.customerId,
        visitId: visit.id,
        invoiceNumber: await nextInvoiceNumber(params.companyId),
        status: "SENT",
        subtotal: Math.max(0, subtotal - priorPaid),
        discountTotal,
        total: invoiceTotal,
        lineItems: {
          create: invoiceLineItems,
        },
      },
    });
    invoice = await prisma.invoice.findFirstOrThrow({
      where: { id: created.id },
      include: { payments: true },
    });
  } else {
    invoice = await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        subtotal: Math.max(0, subtotal - priorPaid),
        discountTotal,
        total: invoiceTotal,
        status: invoicePayments > 0 ? "PARTIAL" : "SENT",
        lineItems: { deleteMany: {}, create: invoiceLineItems },
      },
      include: { payments: true },
    });
  }

  const balanceDue = Math.max(0, invoiceTotal - paidAmount(invoice));
  if (balanceDue <= 0) {
    return { ok: false, error: "This visit invoice is already paid", status: 400 };
  }

  const serialized = await getInvoiceForCompany(params.companyId, invoice.id);
  if (!serialized) return { ok: false, error: "Invoice not found", status: 404 };

  const company = await prisma.company.findUnique({
    where: { id: params.companyId },
    select: { customerBaseUrl: true },
  });

  return {
    ok: true,
    invoiceId: invoice.id,
    balanceDue,
    payLink: getInvoicePayUrl(invoice.publicToken, company),
    invoice: serialized,
  };
}
