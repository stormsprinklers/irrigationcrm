import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse, forbiddenResponse, badRequestResponse } from "@/lib/api-auth";
import { canAccessInvoices } from "@/lib/invoices/permissions";
import { syncEstimateInvoice } from "@/lib/invoices/sync-estimate-invoice";
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
    const estimateState = await prisma.estimate.findFirst({where:{id,companyId:user.companyId},select:{status:true}});
    if (!estimateState) return NextResponse.json({error:"Estimate not found"},{status:404});
    if (estimateState.status !== "APPROVED" && estimateState.status !== "CONVERTED") return badRequestResponse("Approve the estimate before collecting payment");
    const synced = await syncEstimateInvoice({companyId: user.companyId, estimateId: id});
    if (!synced.ok) return NextResponse.json({error: synced.error}, {status: synced.status});
    const invoice = synced.invoice;
    if (body.action === "prepare") return NextResponse.json({balanceDue: invoice.balanceDue});
    const amount = body.amount;
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0 || amount > invoice.balanceDue) return badRequestResponse("Enter an amount greater than zero and no more than the balance due");
    if (body.method === "CASH" || body.method === "CHECK") {
      if (typeof body.idempotencyKey !== "string" || !body.idempotencyKey) return badRequestResponse("Payment reference required");
      const result = await recordInvoicePayment({invoiceId: invoice.id, recordedByUserId: user.id, amount, method: body.method, clientIdempotencyKey: `estimate:${id}:${body.idempotencyKey.slice(0, 100)}`});
      if (!result || result.invoiceId !== invoice.id) return badRequestResponse("Payment could not be recorded");
      return NextResponse.json({ok:true});
    }
    if (body.method !== "CARD") return badRequestResponse("Choose a payment method");
    const estimate = await prisma.estimate.findFirst({where:{id,companyId:user.companyId},include:{customer:true}});
    if (!estimate) return NextResponse.json({error:"Not found"},{status:404});
    const base = request.nextUrl.origin;
    const session = await createInvoiceCheckoutSession({invoice:{id:invoice.id,invoiceNumber:invoice.invoiceNumber,companyId:user.companyId,visitId:null},customerEmail:estimate.customer.email,productName:`Estimate ${estimate.estimateNumber}`,amount,successUrl:`${base}/estimates/${id}?payment=success`,cancelUrl:`${base}/estimates/${id}?payment=cancelled`});
    return NextResponse.json({url:session.url});
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return unauthorizedResponse();
    console.error("Estimate payment failed",error);
    return NextResponse.json({error:"Could not collect payment"},{status:500});
  }
}
