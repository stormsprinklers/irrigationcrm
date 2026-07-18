import { NextRequest, NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { isEmailConfigured } from "@/lib/inbox/email";
import { sendCompanyEmail } from "@/lib/inbox/email-branding";
import { sendSms } from "@/lib/inbox/twilio";
import { outboundCommsErrorResponse } from "@/lib/communications/outbound-guard";
import { getCompanyCallerId } from "@/lib/voice/company-phone";
import {
  canManageCustomerPayments,
  createCardSetupCheckoutSession,
  ensureStripeCustomer,
} from "@/lib/customers/stripe";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  channel: z.enum(["email", "sms"]).default("email"),
});

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canManageCustomerPayments(user.role as UserRole)) return forbiddenResponse();

    const { id } = await params;
    const customer = await prisma.customer.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!customer) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const raw = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) return badRequestResponse("Invalid request body");
    const channel = parsed.data.channel;

    if (channel === "email" && !customer.email) {
      return badRequestResponse("Customer must have an email address to send a secure link");
    }
    if (channel === "sms" && !customer.phone) {
      return badRequestResponse("Customer must have a phone number to text a secure link");
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
        twilioPhone: true,
      },
    });

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

    const companyName = company?.name ?? "Your company";

    if (channel === "sms") {
      const from = (await getCompanyCallerId(user.companyId)) ?? company?.twilioPhone;
      if (!from) {
        return NextResponse.json(
          { error: "No company Twilio phone number configured for SMS" },
          { status: 503 }
        );
      }
      await sendSms({
        companyId: user.companyId,
        from,
        to: customer.phone!,
        body: `${companyName}: Please use this secure link to save your card on file: ${session.url}`,
      });
      return NextResponse.json({ ok: true, url: session.url, textedTo: customer.phone, channel });
    }

    if (!isEmailConfigured()) {
      return NextResponse.json({ error: "Outbound email is not configured" }, { status: 503 });
    }

    const branding = {
      companyName,
      sendgridFrom: company?.sendgridFrom,
      emailSenderName: company?.emailSenderName,
      emailLogoUrl: company?.emailLogoUrl,
    };

    await sendCompanyEmail(branding, {
      companyId: user.companyId,
      to: [customer.email!],
      subject: `Save your card on file — ${companyName}`,
      text: `Hi ${customer.name},\n\nPlease use this secure link to save your payment card on file with ${companyName}:\n\n${session.url}\n\nThis link is hosted by Stripe and your full card number is never stored on our servers.`,
      html: `<p>Hi ${customer.name},</p><p>Please use this secure link to save your payment card on file with ${companyName}:</p><p><a href="${session.url}">Add card securely</a></p><p>This link is hosted by Stripe and your full card number is never stored on our servers.</p>`,
    });

    return NextResponse.json({ ok: true, url: session.url, emailedTo: customer.email, channel });
  } catch (err) {
    const commsDisabled = outboundCommsErrorResponse(err);
    if (commsDisabled) return commsDisabled;
    if (err instanceof Error && err.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message = err instanceof Error ? err.message : "Failed to send link";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
