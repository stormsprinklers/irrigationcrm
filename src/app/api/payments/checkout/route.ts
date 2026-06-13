import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { computeTotals, sumDiscounts, sumLineItems } from "@/lib/visits/totals";
import { nextInvoiceNumber } from "@/lib/visits/queries";

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const body = await request.json();
    const visitId = body.visitId as string | undefined;
    if (!visitId) return badRequestResponse("visitId is required");

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "STRIPE_SECRET_KEY is not configured" }, { status: 503 });
    }

    const visit = await prisma.visit.findFirst({
      where: { id: visitId, companyId: user.companyId },
      include: {
        customer: true,
        lineItems: { orderBy: { sortOrder: "asc" } },
        discounts: true,
      },
    });

    if (!visit) return NextResponse.json({ error: "Visit not found" }, { status: 404 });
    if (!visit.customerId || !visit.customer) {
      return badRequestResponse("Visit must have a customer to collect payment");
    }

    const subtotal = sumLineItems(visit.lineItems);
    const discountTotal = sumDiscounts(subtotal, visit.discounts);
    const { total } = computeTotals(subtotal, discountTotal);

    if (total <= 0) {
      return badRequestResponse("Visit total must be greater than zero");
    }

    let invoice = await prisma.invoice.findFirst({
      where: {
        visitId: visit.id,
        companyId: user.companyId,
        status: { in: ["DRAFT", "SENT", "PARTIAL"] },
      },
    });

    if (!invoice) {
      invoice = await prisma.invoice.create({
        data: {
          companyId: user.companyId,
          customerId: visit.customerId,
          visitId: visit.id,
          invoiceNumber: await nextInvoiceNumber(user.companyId),
          status: "SENT",
          subtotal,
          discountTotal,
          total,
          lineItems: {
            create: visit.lineItems.map((item, index) => ({
              name: item.name,
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              total: item.total,
              sortOrder: index,
            })),
          },
        },
      });
    } else {
      invoice = await prisma.invoice.update({
        where: { id: invoice.id },
        data: { subtotal, discountTotal, total, status: "SENT" },
      });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: visit.customer.email ?? undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: Math.round(total * 100),
            product_data: {
              name: visit.title,
              description: `Invoice ${invoice.invoiceNumber}`,
            },
          },
        },
      ],
      success_url: `${appUrl}/visits/${visit.id}?payment=success`,
      cancel_url: `${appUrl}/visits/${visit.id}?payment=cancelled`,
      metadata: {
        invoiceId: invoice.id,
        visitId: visit.id,
        companyId: user.companyId,
      },
    });

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { stripeCheckoutSessionId: session.id },
    });

    if (!session.url) {
      return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
    }

    return NextResponse.json({ url: session.url });
  } catch {
    return unauthorizedResponse();
  }
}
