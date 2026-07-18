import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { recordInvoicePayment } from "@/lib/invoices/record-payment";
import { syncVisitInvoice } from "@/lib/invoices/sync-visit-invoice";
import { prisma } from "@/lib/prisma";

const MANUAL_METHODS = new Set(["CASH", "CHECK"]);

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const body = await request.json();
    const visitId = body.visitId as string | undefined;
    const method = String(body.method ?? "").toUpperCase();
    const idempotencyKey =
      (typeof body.idempotencyKey === "string" && body.idempotencyKey.trim()) ||
      request.headers.get("idempotency-key")?.trim() ||
      null;

    if (!visitId) return badRequestResponse("visitId is required");
    if (!MANUAL_METHODS.has(method)) {
      return badRequestResponse("method must be CASH or CHECK");
    }

    const synced = await syncVisitInvoice({ companyId: user.companyId, visitId });
    if (!synced.ok) {
      return NextResponse.json({ error: synced.error }, { status: synced.status });
    }

    const amount =
      typeof body.amount === "number" && body.amount > 0 ? body.amount : synced.balanceDue;

    if (amount <= 0) {
      return badRequestResponse("Nothing due on this visit");
    }

    const result = await recordInvoicePayment({
      invoiceId: synced.invoiceId,
      amount,
      method: method as "CASH" | "CHECK",
      recordedByUserId: user.id,
      clientIdempotencyKey: idempotencyKey,
    });

    if (!result) {
      return NextResponse.json({ error: "Failed to record payment" }, { status: 400 });
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id: result.invoiceId, companyId: user.companyId },
      include: { payments: true },
    });

    return NextResponse.json({
      ok: true,
      recorded: result.recorded,
      alreadyRecorded: result.alreadyRecorded,
      invoiceStatus: result.invoiceStatus,
      invoiceId: result.invoiceId,
      method,
      amount,
      invoice,
    });
  } catch {
    return unauthorizedResponse();
  }
}
