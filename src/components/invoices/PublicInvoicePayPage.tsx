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
  const sessionId = searchParams.get("session_id");
  const [invoice, setInvoice] = useState<PublicInvoiceDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadInvoice() {
    const res = await fetch(`/api/invoices/public/${token}`);
    const data = await res.json();
    if (data.error) {
      setError(data.error);
      return null;
    }
    setInvoice(data);
    setError(null);
    return data as PublicInvoiceDTO;
  }

  useEffect(() => {
    loadInvoice()
      .catch(() => setError("Failed to load invoice"))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (paymentStatus !== "success" || !sessionId) return;

    let cancelled = false;
    setConfirming(true);

    async function confirmPayment() {
      try {
        const res = await fetch(`/api/invoices/public/${token}/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        const data = await res.json();
        if (cancelled) return;

        if (data.invoice) {
          setInvoice(data.invoice);
        } else if (res.status === 202) {
          await loadInvoice();
        } else if (!res.ok) {
          toast.error(data.error ?? "Unable to confirm payment");
        }
      } catch {
        if (!cancelled) toast.error("Unable to confirm payment");
      } finally {
        if (!cancelled) setConfirming(false);
      }
    }

    void confirmPayment();
    return () => {
      cancelled = true;
    };
  }, [paymentStatus, sessionId, token]);

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

  const isPaid =
    invoice.balanceDue <= 0 ||
    invoice.status === "PAID" ||
    invoice.status === "REFUNDED" ||
    invoice.status === "VOID";
  const isRefunded = invoice.status === "REFUNDED";

  return (
    <main className="mx-auto max-w-lg p-8">
      <p className="text-sm text-muted-foreground">{invoice.companyName}</p>
      <h1 className="mt-1 text-2xl font-semibold">Invoice {invoice.invoiceNumber}</h1>
      <p className="mt-1 text-sm text-muted-foreground">Bill to {invoice.customerName}</p>

      {confirming ? (
        <p className="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-800">
          Confirming your payment...
        </p>
      ) : null}

      {paymentStatus === "success" && !isPaid && !confirming ? (
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
        {!isPaid ? (
          <div className="flex justify-between text-base font-semibold">
            <span>Balance due</span>
            <span>{formatCurrency(invoice.balanceDue)}</span>
          </div>
        ) : null}
      </div>

      {isRefunded ? (
        <div className="mt-6 rounded-lg bg-muted p-4 text-sm text-muted-foreground">
          This invoice has been refunded and is no longer payable.
        </div>
      ) : isPaid ? (
        <div className="mt-6 flex items-center gap-2 rounded-lg bg-green-50 p-4 text-green-800">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <div>
            <p className="text-sm font-medium">This invoice is paid. Thank you!</p>
            {invoice.paidAt ? (
              <p className="text-xs text-green-700">
                Paid on {new Date(invoice.paidAt).toLocaleString()}
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <Button className="mt-6 w-full" size="lg" onClick={handlePay} disabled={paying || confirming}>
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
