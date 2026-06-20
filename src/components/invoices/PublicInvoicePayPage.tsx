"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CreditCard, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { PublicInvoiceDTO } from "@/lib/invoices/types";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

type Props = {
  token: string;
};

export function PublicInvoicePayPage({ token }: Props) {
  const searchParams = useSearchParams();
  const paymentStatus = searchParams.get("payment");
  const [invoice, setInvoice] = useState<PublicInvoiceDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/invoices/public/${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        setInvoice(data);
      })
      .catch(() => setError("Failed to load invoice"))
      .finally(() => setLoading(false));
  }, [token]);

  async function handlePay() {
    setPaying(true);
    try {
      const res = await fetch(`/api/invoices/public/${token}/checkout`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Unable to start checkout");
        return;
      }
      if (data.url) {
        window.location.href = data.url;
      }
    } finally {
      setPaying(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-lg p-8">
        <p className="text-sm text-muted-foreground">Loading invoice...</p>
      </main>
    );
  }

  if (error || !invoice) {
    return (
      <main className="mx-auto max-w-lg p-8">
        <h1 className="text-2xl font-semibold">Invoice not found</h1>
        <p className="mt-2 text-muted-foreground">{error ?? "This link may be invalid or expired."}</p>
      </main>
    );
  }

  const isPaid = invoice.balanceDue <= 0 || invoice.status === "PAID";

  return (
    <main className="mx-auto max-w-lg p-8">
      <p className="text-sm text-muted-foreground">{invoice.companyName}</p>
      <h1 className="mt-1 text-2xl font-semibold">Invoice {invoice.invoiceNumber}</h1>
      <p className="mt-1 text-sm text-muted-foreground">Bill to {invoice.customerName}</p>

      {paymentStatus === "success" && !isPaid ? (
        <p className="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-800">
          Payment submitted. This page will update once processing completes.
        </p>
      ) : null}

      {paymentStatus === "cancelled" ? (
        <p className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          Payment was cancelled. You can try again below.
        </p>
      ) : null}

      <div className="mt-6 space-y-2 rounded-lg border border-border bg-white p-4">
        {invoice.lineItems.map((item) => (
          <div key={item.id} className="flex justify-between text-sm">
            <span>
              {item.name}
              {item.quantity !== 1 ? ` × ${item.quantity}` : ""}
            </span>
            <span>{formatCurrency(item.total)}</span>
          </div>
        ))}
        {invoice.discountTotal > 0 ? (
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Discounts</span>
            <span>−{formatCurrency(invoice.discountTotal)}</span>
          </div>
        ) : null}
        <div className="flex justify-between border-t border-border pt-2 font-semibold">
          <span>Total</span>
          <span>{formatCurrency(invoice.total)}</span>
        </div>
        {invoice.amountPaid > 0 ? (
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Paid</span>
            <span>−{formatCurrency(invoice.amountPaid)}</span>
          </div>
        ) : null}
        <div className="flex justify-between text-base font-semibold">
          <span>Balance due</span>
          <span>{formatCurrency(invoice.balanceDue)}</span>
        </div>
      </div>

      {isPaid ? (
        <div className="mt-6 flex items-center gap-2 rounded-lg bg-green-50 p-4 text-green-800">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">This invoice is paid. Thank you!</p>
        </div>
      ) : (
        <Button className="mt-6 w-full" size="lg" onClick={handlePay} disabled={paying}>
          <CreditCard className="h-4 w-4" />
          {paying ? "Redirecting to Stripe..." : `Pay ${formatCurrency(invoice.balanceDue)}`}
        </Button>
      )}

      <p className="mt-4 text-center text-xs text-muted-foreground">
        Secure payment powered by Stripe
      </p>
    </main>
  );
}
