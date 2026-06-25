import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/stripe/client";

export async function ensureStripeCustomer(
  customer: { id: string; name: string; email: string | null; stripeCustomerId: string | null },
  companyId: string
) {
  if (customer.stripeCustomerId) return customer.stripeCustomerId;

  if (!process.env.STRIPE_SECRET_KEY) return null;

  const stripe = getStripeClient();
  const stripeCustomer = await stripe.customers.create({
    name: customer.name,
    email: customer.email ?? undefined,
    metadata: { customerId: customer.id, companyId },
  });

  await prisma.customer.update({
    where: { id: customer.id },
    data: { stripeCustomerId: stripeCustomer.id },
  });

  return stripeCustomer.id;
}

export async function createCardSetupCheckoutSession(params: {
  customerId: string;
  companyId: string;
  stripeCustomerId: string;
  appUrl: string;
}) {
  const stripe = getStripeClient();
  const company = await prisma.company.findUnique({
    where: { id: params.companyId },
    select: { name: true },
  });

  return stripe.checkout.sessions.create({
    mode: "setup",
    customer: params.stripeCustomerId,
    payment_method_types: ["card"],
    success_url: `${params.appUrl}/pay/card/success?customer=${params.customerId}`,
    cancel_url: `${params.appUrl}/pay/card/cancelled?customer=${params.customerId}`,
    metadata: {
      customerId: params.customerId,
      companyId: params.companyId,
      purpose: "card_on_file",
    },
    custom_text: {
      submit: {
        message: `Save your card with ${company?.name ?? "us"} for faster checkout on future service.`,
      },
    },
  });
}

export function canManageCustomerPayments(role: UserRole) {
  return role === "CSR" || role === "SALES" || role === "MANAGER" || role === "ADMIN";
}
