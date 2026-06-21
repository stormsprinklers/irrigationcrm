"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { InvoiceDTO } from "@/lib/invoices/types";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

type RefundablePayment = {
  id: string;
  amount: number;
  method: string;
  paidAt: string;
  stripePaymentIntentId: string | null;
};

type Props = {
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  open: boolean;
  onClose: () => void;
  onRefunded?: (invoice: InvoiceDTO) => void;
};

export function IssueRefundDialog({
  invoiceId,
  invoiceNumber,
  customerName,
  open,
  onClose,
  onRefunded,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [payments, setPayments] = useState<RefundablePayment[]>([]);
  const [amountPaid, setAmountPaid] = useState(0);
  const [paymentId, setPaymentId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) return;

    setLoading(true);
    fetch(`/api/invoices/${invoiceId}`)
      .then((r) => r.json())
      .then((data: InvoiceDTO & { error?: string }) => {
        if (data.error) {
          toast.error(data.error);
          onClose();
          return;
        }

        const refundable = data.payments.filter((payment) => !payment.refundedAt && payment.amount > 0);
        setPayments(
          refundable.map((payment) => ({
            id: payment.id,
            amount: payment.amount,
            method: payment.method,
            paidAt: payment.paidAt,
            stripePaymentIntentId: null,
          }))
        );
        setAmountPaid(data.amountPaid);
        const first = refundable[0];
        setPaymentId(first?.id ?? "");
        setAmount(first ? String(first.amount) : "");
        setReason("");
      })
      .catch(() => toast.error("Failed to load invoice payments"))
      .finally(() => setLoading(false));
  }, [open, invoiceId, onClose]);

  const selectedPayment = payments.find((payment) => payment.id === paymentId);
  const maxRefund = selectedPayment?.amount ?? 0;

  function handlePaymentChange(nextPaymentId: string) {
    setPaymentId(nextPaymentId);
    const payment = payments.find((entry) => entry.id === nextPaymentId);
    setAmount(payment ? String(payment.amount) : "");
  }

  async function submitRefund(e: React.FormEvent) {
    e.preventDefault();
    if (!paymentId) {
      toast.error("Select a payment to refund");
      return;
    }

    const refundAmount = Number(amount);
    if (!refundAmount || refundAmount <= 0) {
      toast.error("Enter a valid refund amount");
      return;
    }
    if (refundAmount > maxRefund + 0.001) {
      toast.error(`Refund cannot exceed ${formatCurrency(maxRefund)}`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentId,
          amount: refundAmount,
          reason: reason.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Refund failed");
        return;
      }

      toast.success(`Refunded ${formatCurrency(data.refundAmount ?? refundAmount)} to ${customerName}`);
      onRefunded?.(data.invoice ?? data);
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  const selectClassName =
    "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md rounded-lg border bg-background p-6 shadow-lg">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Issue refund</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Invoice {invoiceNumber} · {customerName}
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading payments...</p>
        ) : payments.length === 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              No refundable payments on this invoice.
              {amountPaid <= 0 ? " Nothing has been collected yet." : null}
            </p>
            <Button type="button" variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        ) : (
          <form onSubmit={submitRefund} className="space-y-4">
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p>
                Collected: <strong>{formatCurrency(amountPaid)}</strong>
              </p>
            </div>

            {payments.length > 1 ? (
              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="refund-payment">
                  Payment
                </label>
                <select
                  id="refund-payment"
                  value={paymentId}
                  onChange={(e) => handlePaymentChange(e.target.value)}
                  className={selectClassName}
                >
                  {payments.map((payment) => (
                    <option key={payment.id} value={payment.id}>
                      {formatCurrency(payment.amount)} · {payment.method} ·{" "}
                      {new Date(payment.paidAt).toLocaleDateString()}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="refund-amount">
                Refund amount
              </label>
              <Input
                id="refund-amount"
                type="number"
                min="0.01"
                step="0.01"
                max={maxRefund}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Maximum refundable on this payment: {formatCurrency(maxRefund)}
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="refund-reason">
                Reason (optional)
              </label>
              <Input
                id="refund-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Service not completed"
              />
            </div>

            {selectedPayment?.method === "STRIPE" ? (
              <p className="text-xs text-muted-foreground">
                Stripe will return funds to the customer&apos;s original payment method.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                This payment was recorded as {selectedPayment?.method}. Issue the refund through your
                normal payout process and record it here.
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <Button type="submit" variant="destructive" disabled={submitting}>
                {submitting ? "Processing..." : "Issue refund"}
              </Button>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
