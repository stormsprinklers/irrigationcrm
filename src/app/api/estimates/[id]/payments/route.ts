import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse, forbiddenResponse, badRequestResponse } from "@/lib/api-auth";
import { canAccessInvoices } from "@/lib/invoices/permissions";
import {
  getEstimateInvoiceAvailability,
  syncEstimateInvoice,
} from "@/lib/invoices/sync-estimate-invoice";
import { recordInvoicePayment } from "@/lib/invoices/record-payment";
import { createInvoiceCheckoutSession } from "@/lib/stripe/invoice-checkout";
import { prisma } from "@/lib/prisma";

type Params = {params: Promise<{id: string}>};
export async function POST(request: NextRequest, {params}: Params) {
  try {
    const user = await requireSessionUser(request);
    if (!canAccessInvoices(user.role)) return forbiddenResponse();
    const {id} = await params;
    const body = await request.json();
    const estimateState = await prisma.estimate.findFirst({
      where: { id, companyId: user.companyId },
      select: { status: true, signedAt: true },
    });
    if (!estimateState) return NextResponse.json({error:"Estimate not found"},{status:404});
    const canCollect =
      estimateState.status === "APPROVED" ||
      estimateState.status === "CONVERTED" ||
      (estimateState.status === "SENT" && Boolean(estimateState.signedAt));
    if (!canCollect) return badRequestResponse("The customer must sign the estimate before collecting payment");

    if (body.action === "prepare") {
      const availability = await getEstimateInvoiceAvailability({
        companyId: user.companyId,
        estimateId: id,
      });
      if (!availability.ok) {
        return NextResponse.json({ error: availability.error }, { status: availability.status });
      }
      return NextResponse.json({
        estimateTotal: availability.estimateTotal,
        paid: availability.paid,
        balanceDue: availability.remainingBalance,
      });
    }

    const amount = body.amount;
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      return badRequestResponse("Enter an amount greater than zero");
    }
    const synced = await syncEstimateInvoice({
      companyId: user.companyId,
      estimateId: id,
      amountSelection: { type: "FIXED", value: amount },
    });
    if (!synced.ok) return NextResponse.json({error: synced.error}, {status: synced.status});
    const invoice = synced.invoice;
    const paymentAmount = invoice.balanceDue;
    if (paymentAmount <= 0) return badRequestResponse("This estimate does not have a balance to pay");
    if (body.method === "CASH" || body.method === "CHECK") {
      if (typeof body.idempotencyKey !== "string" || !body.idempotencyKey) return badRequestResponse("Payment reference required");
      const result = await recordInvoicePayment({invoiceId: invoice.id, recordedByUserId: user.id, amount: paymentAmount, method: body.method, clientIdempotencyKey: `estimate:${id}:${body.idempotencyKey.slice(0, 100)}`});
      if (!result || result.invoiceId !== invoice.id) return badRequestResponse("Payment could not be recorded");
      return NextResponse.json({ok:true});
    }
    if (body.method !== "CARD") return badRequestResponse("Choose a payment method");
    const estimate = await prisma.estimate.findFirst({where:{id,companyId:user.companyId},include:{customer:true}});
    if (!estimate) return NextResponse.json({error:"Not found"},{status:404});
    const base = request.nextUrl.origin;
    const session = await createInvoiceCheckoutSession({invoice:{id:invoice.id,invoiceNumber:invoice.invoiceNumber,companyId:user.companyId,visitId:null},customerEmail:estimate.customer.email,productName:`Estimate ${estimate.estimateNumber}`,amount:paymentAmount,successUrl:`${base}/estimates/${id}?payment=success`,cancelUrl:`${base}/estimates/${id}?payment=cancelled`});
    return NextResponse.json({url:session.url});
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return unauthorizedResponse();
    console.error("Estimate payment failed",error);
    return NextResponse.json({error:"Could not collect payment"},{status:500});
  }
}
