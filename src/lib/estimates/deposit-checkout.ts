import { prisma } from "@/lib/prisma";
import { createInvoiceCheckoutSession } from "@/lib/stripe/invoice-checkout";
import { computeDepositAmount } from "@/lib/estimates/booking";
import { toNumber } from "@/lib/visits/totals";

export async function createEstimateDepositCheckout(params: {
  estimateId: string;
  successUrl: string;
  cancelUrl: string;
}) {
  const estimate = await prisma.estimate.findUnique({
    where: { id: params.estimateId },
    include: { customer: true, company: true },
  });
  if (!estimate) throw new Error("Estimate not found");

  const depositAmount = computeDepositAmount(estimate);
  if (depositAmount <= 0) throw new Error("No deposit required");

  const prefix = estimate.company.invoicePrefix ?? "INV";
  const invoiceNumber = `${prefix}-DEP-${estimate.id.slice(-6).toUpperCase()}`;

  const existing = await prisma.invoice.findFirst({
    where: { estimateId: estimate.id, companyId: estimate.companyId },
    orderBy: { createdAt: "desc" },
  });

  const invoice =
    existing ??
    (await prisma.invoice.create({
      data: {
        companyId: estimate.companyId,
        customerId: estimate.customerId,
        estimateId: estimate.id,
        invoiceNumber,
        status: "SENT",
        subtotal: depositAmount,
        total: depositAmount,
        sentAt: new Date(),
        lineItems: {
          create: [
            {
              name: "Installation deposit",
              description: `50% deposit to book — estimate approval`,
              quantity: 1,
              unitPrice: depositAmount,
              total: depositAmount,
            },
          ],
        },
      },
    }));

  const balance = toNumber(invoice.total);
  const session = await createInvoiceCheckoutSession({
    invoice: {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      companyId: invoice.companyId,
      visitId: invoice.visitId,
    },
    customerEmail: estimate.customer.email,
    productName: `Deposit — ${estimate.customer.name}`,
    amount: balance,
    successUrl: params.successUrl,
    cancelUrl: params.cancelUrl,
  });

  return { url: session.url, invoiceId: invoice.id };
}
