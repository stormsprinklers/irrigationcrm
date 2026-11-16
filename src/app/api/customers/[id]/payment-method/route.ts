import { NextRequest, NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { writeStaffAuditLog } from "@/lib/audit/staff-audit";
import {
  canManageCustomerPayments,
  ensureStripeCustomer,
} from "@/lib/customers/stripe";
import { prisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/stripe/client";

type Params = { params: Promise<{ id: string }> };

function stripeCustomerId(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value && typeof value.id === "string") {
    return value.id;
  }
  return null;
}

async function customerForPaymentMethods(id: string, companyId: string) {
  return prisma.customer.findFirst({
    where: { id, companyId },
    select: { id: true, name: true, email: true, stripeCustomerId: true },
  });
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canManageCustomerPayments(user.role as UserRole)) return forbiddenResponse();

    const { id } = await params;
    const customer = await customerForPaymentMethods(id, user.companyId);
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
    const stripeCustomer = await stripe.customers.retrieve(customer.stripeCustomerId);
    const defaultPaymentMethodId = stripeCustomer.deleted
      ? null
      : stripeCustomerId(stripeCustomer.invoice_settings.default_payment_method);

    return NextResponse.json({
      stripeCustomerId: customer.stripeCustomerId,
      defaultPaymentMethodId,
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
    if (!canManageCustomerPayments(user.role as UserRole)) return forbiddenResponse();

    const { id } = await params;
    const customer = await customerForPaymentMethods(id, user.companyId);
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

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canManageCustomerPayments(user.role as UserRole)) return forbiddenResponse();

    const { id } = await params;
    const customer = await customerForPaymentMethods(id, user.companyId);
    if (!customer?.stripeCustomerId) {
      return NextResponse.json({ error: "Customer has no Stripe account" }, { status: 404 });
    }
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "STRIPE_SECRET_KEY is not configured" }, { status: 503 });
    }

    const body = (await request.json().catch(() => ({}))) as { paymentMethodId?: string };
    const paymentMethodId = body.paymentMethodId?.trim();
    if (!paymentMethodId) return badRequestResponse("Choose a payment method");

    const stripe = getStripeClient();
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (stripeCustomerId(paymentMethod.customer) !== customer.stripeCustomerId) {
      return NextResponse.json({ error: "Payment method not found" }, { status: 404 });
    }

    await stripe.customers.update(customer.stripeCustomerId, {
      invoice_settings: { default_payment_method: paymentMethod.id },
    });

    const subscriptions = await prisma.maintenancePlanEnrollment.findMany({
      where: {
        companyId: user.companyId,
        customerId: customer.id,
        stripeSubscriptionId: { not: null },
      },
      select: { stripeSubscriptionId: true },
    });
    await Promise.all(
      subscriptions.map((enrollment) =>
        stripe.subscriptions.update(enrollment.stripeSubscriptionId!, {
          default_payment_method: paymentMethod.id,
        })
      )
    );
    await prisma.maintenancePlanEnrollment.updateMany({
      where: { companyId: user.companyId, customerId: customer.id },
      data: { stripePaymentMethodId: paymentMethod.id },
    });

    await writeStaffAuditLog({
      companyId: user.companyId,
      actorId: user.id,
      entityType: "CustomerPaymentMethod",
      entityId: paymentMethod.id,
      customerId: customer.id,
      action: "SET_DEFAULT",
      after: { brand: paymentMethod.card?.brand ?? null, last4: paymentMethod.card?.last4 ?? null },
    });

    return NextResponse.json({ ok: true, defaultPaymentMethodId: paymentMethod.id });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return unauthorizedResponse();
    console.error("Failed to update customer payment method", error);
    return NextResponse.json({ error: "Failed to update card on file" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canManageCustomerPayments(user.role as UserRole)) return forbiddenResponse();

    const { id } = await params;
    const customer = await customerForPaymentMethods(id, user.companyId);
    if (!customer?.stripeCustomerId) {
      return NextResponse.json({ error: "Customer has no Stripe account" }, { status: 404 });
    }
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "STRIPE_SECRET_KEY is not configured" }, { status: 503 });
    }

    const body = (await request.json().catch(() => ({}))) as { paymentMethodId?: string };
    const paymentMethodId = body.paymentMethodId?.trim();
    if (!paymentMethodId) return badRequestResponse("Choose a payment method");

    const stripe = getStripeClient();
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (stripeCustomerId(paymentMethod.customer) !== customer.stripeCustomerId) {
      return NextResponse.json({ error: "Payment method not found" }, { status: 404 });
    }

    const stripeCustomer = await stripe.customers.retrieve(customer.stripeCustomerId);
    const previousDefaultId = stripeCustomer.deleted
      ? null
      : stripeCustomerId(stripeCustomer.invoice_settings.default_payment_method);

    await stripe.paymentMethods.detach(paymentMethod.id);
    const remaining = await stripe.paymentMethods.list({
      customer: customer.stripeCustomerId,
      type: "card",
    });
    const replacementId =
      previousDefaultId &&
      previousDefaultId !== paymentMethod.id &&
      remaining.data.some((method) => method.id === previousDefaultId)
        ? previousDefaultId
        : remaining.data[0]?.id ?? null;
    await stripe.customers.update(customer.stripeCustomerId, {
      invoice_settings: { default_payment_method: replacementId },
    });

    const affectedEnrollments = await prisma.maintenancePlanEnrollment.findMany({
      where: {
        companyId: user.companyId,
        customerId: customer.id,
        stripePaymentMethodId: paymentMethod.id,
      },
      select: { stripeSubscriptionId: true },
    });
    await Promise.all(
      affectedEnrollments
        .filter((enrollment) => Boolean(enrollment.stripeSubscriptionId))
        .map((enrollment) =>
          stripe.subscriptions.update(enrollment.stripeSubscriptionId!, {
            default_payment_method: replacementId ?? "",
          })
        )
    );
    await prisma.maintenancePlanEnrollment.updateMany({
      where: {
        companyId: user.companyId,
        customerId: customer.id,
        stripePaymentMethodId: paymentMethod.id,
      },
      data: { stripePaymentMethodId: replacementId },
    });

    await writeStaffAuditLog({
      companyId: user.companyId,
      actorId: user.id,
      entityType: "CustomerPaymentMethod",
      entityId: paymentMethod.id,
      customerId: customer.id,
      action: "REMOVE",
      before: { brand: paymentMethod.card?.brand ?? null, last4: paymentMethod.card?.last4 ?? null },
      after: { replacementPaymentMethodId: replacementId },
    });

    return NextResponse.json({ ok: true, defaultPaymentMethodId: replacementId });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return unauthorizedResponse();
    console.error("Failed to remove customer payment method", error);
    return NextResponse.json({ error: "Failed to remove card on file" }, { status: 500 });
  }
}
