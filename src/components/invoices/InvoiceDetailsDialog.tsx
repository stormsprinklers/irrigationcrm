"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, FileText, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { InvoiceDTO } from "@/lib/invoices/types";

type Props = {
  invoiceId: string | null;
  onClose: () => void;
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function InvoiceDetailsDialog({ invoiceId, onClose }: Props) {
  const [invoice, setInvoice] = useState<InvoiceDTO | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!invoiceId) return;
    let cancelled = false;
    setInvoice(null);
    setLoading(true);
    fetch(`/api/invoices/${invoiceId}`)
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "Could not load invoice");
        if (!cancelled) setInvoice(data as InvoiceDTO);
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Could not load invoice");
          onClose();
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [invoiceId, onClose]);

  if (!invoiceId) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button type="button" aria-label="Close invoice details" className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="invoice-details-title" className="relative z-10 max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-xl border bg-background p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-primary/10 p-2 text-primary"><FileText className="h-5 w-5" /></div>
            <div>
              <h2 id="invoice-details-title" className="text-lg font-semibold">{invoice ? `Invoice ${invoice.invoiceNumber}` : "Invoice details"}</h2>
              {invoice ? <p className="mt-1 text-sm text-muted-foreground">{invoice.customer.name} · Created {dateTime(invoice.createdAt)}</p> : null}
            </div>
          </div>
          <Button type="button" size="icon" variant="ghost" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></Button>
        </div>

        {loading || !invoice ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading invoice…</div>
        ) : (
          <div className="mt-6 space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{invoice.status}</Badge>
              {invoice.sentAt ? <span className="text-xs text-muted-foreground">Sent {dateTime(invoice.sentAt)}</span> : null}
              {invoice.visit ? <Button type="button" variant="link" size="sm" asChild><Link href={`/visits/${invoice.visit.id}`}>View job <ExternalLink className="h-3.5 w-3.5" /></Link></Button> : null}
              {invoice.estimate ? <Button type="button" variant="link" size="sm" asChild><Link href={`/estimates/${invoice.estimate.id}`}>View estimate <ExternalLink className="h-3.5 w-3.5" /></Link></Button> : null}
            </div>

            <div className="rounded-lg border">
              <div className="grid grid-cols-[1fr_auto] gap-3 border-b bg-muted/30 px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground"><span>Line item</span><span>Amount</span></div>
              <div className="divide-y">
                {invoice.lineItems.map((item) => (
                  <div key={item.id} className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3 text-sm">
                    <div><p className="font-medium">{item.name}{item.quantity !== 1 ? ` × ${item.quantity}` : ""}</p>{item.description ? <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p> : null}</div>
                    <span>{money(item.total)}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-2 border-t bg-muted/20 px-4 py-3 text-sm">
                <div className="flex justify-between"><span>Subtotal</span><span>{money(invoice.subtotal)}</span></div>
                {invoice.discountTotal > 0 ? <div className="flex justify-between text-muted-foreground"><span>Discounts</span><span>−{money(invoice.discountTotal)}</span></div> : null}
                {invoice.tax > 0 ? <div className="flex justify-between text-muted-foreground"><span>Tax</span><span>{money(invoice.tax)}</span></div> : null}
                <div className="flex justify-between border-t pt-2 font-semibold"><span>Total</span><span>{money(invoice.total)}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>Paid</span><span>−{money(invoice.amountPaid)}</span></div>
                <div className="flex justify-between text-base font-semibold"><span>Balance due</span><span>{money(invoice.balanceDue)}</span></div>
              </div>
            </div>

            {invoice.payments.length > 0 ? (
              <div>
                <h3 className="text-sm font-semibold">Payments</h3>
                <div className="mt-2 divide-y rounded-lg border">
                  {invoice.payments.map((payment) => (
                    <div key={payment.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                      <div><p className="font-medium">{payment.method}</p><p className="text-xs text-muted-foreground">{dateTime(payment.paidAt)}{payment.refundedAt ? ` · Refunded ${dateTime(payment.refundedAt)}` : ""}</p></div>
                      <span className={payment.refundedAt ? "text-muted-foreground line-through" : "font-medium"}>{money(payment.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2">
              {invoice.balanceDue > 0 && invoice.status !== "VOID" && invoice.status !== "REFUNDED" ? <Button type="button" asChild><Link href={`/pay/${invoice.publicToken}`} target="_blank" rel="noopener noreferrer">Take payment <ExternalLink className="h-4 w-4" /></Link></Button> : null}
              <Button type="button" variant="outline" onClick={onClose}>Close</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
