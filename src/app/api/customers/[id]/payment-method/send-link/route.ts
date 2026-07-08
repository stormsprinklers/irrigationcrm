import { NextRequest, NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { isEmailConfigured } from "@/lib/inbox/email";
import { sendCompanyEmail } from "@/lib/inbox/email-branding";
import { outboundCommsErrorResponse } from "@/lib/communications/outbound-guard";
import {
  canManageCustomerPayments,
  createCardSetupCheckoutSession,
  ensureStripeCustomer,
} from "@/lib/customers/stripe";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canManageCustomerPayments(user.role as UserRole)) return forbiddenResponse();

    const { id } = await params;
    const customer = await prisma.customer.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!customer) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (!customer.email) {
      return badRequestResponse("Customer must have an email address to send a secure link");
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "STRIPE_SECRET_KEY is not configured" }, { status: 503 });
    }

    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: {
        name: true,
        sendgridFrom: true,
        emailSenderName: true,
        emailLogoUrl: true,
      },
    });

    if (!isEmailConfigured()) {
      return NextResponse.json({ error: "Outbound email is not configured" }, { status: 503 });
    }

    const branding = {
      companyName: company?.name ?? "Your company",
      sendgridFrom: company?.sendgridFrom,
      emailSenderName: company?.emailSenderName,
      emailLogoUrl: company?.emailLogoUrl,
    };

    const stripeCustomerId = await ensureStripeCustomer(customer, user.companyId);
    if (!stripeCustomerId) return badRequestResponse("Failed to create Stripe customer");

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
    const session = await createCardSetupCheckoutSession({
      customerId: customer.id,
      companyId: user.companyId,
      stripeCustomerId,
      appUrl,
    });

    if (!session.url) {
      return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
    }

    const companyName = branding.companyName;

    await sendCompanyEmail(branding, {
      companyId: user.companyId,
      to: [customer.email],
      subject: `Save your card on file — ${companyName}`,
      text: `Hi ${customer.name},\n\nPlease use this secure link to save your payment card on file with ${companyName}:\n\n${session.url}\n\nThis link is hosted by Stripe and your full card number is never stored on our servers.`,
      html: `<p>Hi ${customer.name},</p><p>Please use this secure link to save your payment card on file with ${companyName}:</p><p><a href="${session.url}">Add card securely</a></p><p>This link is hosted by Stripe and your full card number is never stored on our servers.</p>`,
    });

    return NextResponse.json({ ok: true, url: session.url, emailedTo: customer.email });
  } catch (err) {
    const commsDisabled = outboundCommsErrorResponse(err);
    if (commsDisabled) return commsDisabled;
    const message = err instanceof Error ? err.message : "Failed to send link";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
