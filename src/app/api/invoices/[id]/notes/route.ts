import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { canAccessInvoices } from "@/lib/invoices/permissions";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/visits/totals";

type Params = { params: Promise<{ id: string }> };

const authorSelect = { id: true, name: true } as const;

function serializeNote(note: {
  id: string;
  body: string;
  automated: boolean;
  createdAt: Date;
  author: { id: string; name: string } | null;
}) {
  return {
    id: note.id,
    body: note.body,
    automated: note.automated,
    createdAt: note.createdAt.toISOString(),
    author: note.author,
  };
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canAccessInvoices(user.role)) return forbiddenResponse();

    const { id } = await params;
    const notes = await prisma.invoiceNote.findMany({
      where: { invoiceId: id, invoice: { companyId: user.companyId } },
      include: { author: { select: authorSelect } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(notes.map(serializeNote));
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canAccessInvoices(user.role)) return forbiddenResponse();

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const noteBody = typeof body.body === "string" ? body.body.trim() : "";
    if (!noteBody) return badRequestResponse("Note body is required");
    if (noteBody.length > 4_000) return badRequestResponse("Note must be 4,000 characters or less");

    const invoice = await prisma.invoice.findFirst({
      where: { id, companyId: user.companyId },
      select: { status: true, total: true, payments: { select: { amount: true, refundedAt: true } } },
    });
    if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (["PAID", "REFUNDED", "VOID"].includes(invoice.status)) {
      return badRequestResponse("Private follow-up notes can only be added to outstanding invoices");
    }

    const amountPaid = invoice.payments.reduce(
      (sum, payment) => sum + (payment.refundedAt ? 0 : toNumber(payment.amount)),
      0
    );
    if (toNumber(invoice.total) - amountPaid <= 0) {
      return badRequestResponse("Private follow-up notes can only be added to outstanding invoices");
    }

    const note = await prisma.invoiceNote.create({
      data: { invoiceId: id, authorId: user.id, body: noteBody },
      include: { author: { select: authorSelect } },
    });
    return NextResponse.json(serializeNote(note), { status: 201 });
  } catch {
    return unauthorizedResponse();
  }
}
