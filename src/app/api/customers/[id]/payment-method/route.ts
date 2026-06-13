import { NextRequest, NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canManageEnrollments } from "@/lib/maintenance-plans/permissions";
import { prisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/stripe/client";

type Params = { params: Promise<{ id: string }> };

async function ensureStripeCustomer(
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

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canManageEnrollments(user.role as UserRole)) return forbiddenResponse();

    const { id } = await params;
    const customer = await prisma.customer.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!customer) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (!process.env.STRIPE_SECRET_KEY || !customer.stripeCustomerId) {
      return NextResponse.json({
        stripeCustomerId: customer.stripeCustomerId,
        paymentMethods: [],
      });
    }

    const stripe = getStripeClient();
    const methods = await stripe.paymentMethods.list({
      customer: customer.stripeCustomerId,
      type: "card",
    });

    return NextResponse.json({
      stripeCustomerId: customer.stripeCustomerId,
      paymentMethods: methods.data.map((pm) => ({
        id: pm.id,
        brand: pm.card?.brand ?? null,
        last4: pm.card?.last4 ?? null,
        expMonth: pm.card?.exp_month ?? null,
        expYear: pm.card?.exp_year ?? null,
      })),
    });
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canManageEnrollments(user.role as UserRole)) return forbiddenResponse();

    const { id } = await params;
    const customer = await prisma.customer.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!customer) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "STRIPE_SECRET_KEY is not configured" }, { status: 503 });
    }

    const stripeCustomerId = await ensureStripeCustomer(customer, user.companyId);
    if (!stripeCustomerId) return badRequestResponse("Failed to create Stripe customer");

    const stripe = getStripeClient();
    const setupIntent = await stripe.setupIntents.create({
      customer: stripeCustomerId,
      payment_method_types: ["card"],
      metadata: { customerId: customer.id, companyId: user.companyId },
    });

    if (!setupIntent.client_secret) {
      return NextResponse.json({ error: "Failed to create setup intent" }, { status: 500 });
    }

    return NextResponse.json(
      {
        clientSecret: setupIntent.client_secret,
        setupIntentId: setupIntent.id,
        stripeCustomerId,
      },
      { status: 201 }
    );
  } catch {
    return unauthorizedResponse();
  }
}
