import { prisma } from "@/lib/prisma";
import { createInvoiceCheckoutSession } from "@/lib/stripe/invoice-checkout";
import { computeApprovalPaymentAmount, computeDepositAmount } from "@/lib/estimates/booking";
import { toNumber } from "@/lib/visits/totals";
import { createPublicCapability } from "@/lib/security/public-capability";

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

  if (!estimate.signedAt || (estimate.status !== "SENT" && estimate.status !== "APPROVED")) {
    throw new Error("Sign the estimate before submitting payment");
  }

  const depositAmount = computeDepositAmount(estimate);
  const paymentAmount = computeApprovalPaymentAmount(estimate);
  if (paymentAmount <= 0) throw new Error("This estimate does not have a balance to pay");
  const isDeposit = depositAmount > 0;

  const prefix = estimate.company.invoicePrefix ?? "INV";
  const invoiceNumber = `${prefix}-${isDeposit ? "DEP" : "PAY"}-${estimate.id.slice(-6).toUpperCase()}`;

  const existing = await prisma.invoice.findFirst({
    where: { estimateId: estimate.id, companyId: estimate.companyId, invoiceNumber },
    orderBy: { createdAt: "desc" },
  });

  const invoice =
    existing ??
    (await prisma.invoice.create({
      data: {
        ...createPublicCapability(),
        companyId: estimate.companyId,
        customerId: estimate.customerId,
        estimateId: estimate.id,
        invoiceNumber,
        status: "SENT",
        subtotal: paymentAmount,
        total: paymentAmount,
        sentAt: new Date(),
        lineItems: {
          create: [
            {
              name: isDeposit ? "Installation deposit" : "Estimate payment",
              description: isDeposit ? "Deposit" : "Payment for approved estimate",
              quantity: 1,
              unitPrice: paymentAmount,
              total: paymentAmount,
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
    productName: `${isDeposit ? "Deposit" : "Estimate payment"} — ${estimate.customer.name}`,
    amount: balance,
    successUrl: params.successUrl,
    cancelUrl: params.cancelUrl,
  });

  return { url: session.url, invoiceId: invoice.id };
}
