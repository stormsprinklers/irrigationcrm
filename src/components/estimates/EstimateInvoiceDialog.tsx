"use client";

import { useEffect, useMemo, useState } from "react";
import { Banknote, CreditCard, FileText, Loader2, Mail, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AmountType = "PERCENT" | "FIXED";
type Channel = "EMAIL" | "SMS";
type WorkingAction = Channel | "CARD" | "CASH" | "CHECK" | null;

type InvoiceAvailability = {
  estimateTotal: number;
  paid: number;
  remainingBalance: number;
};

type Props = {
  open: boolean;
  estimateId: string;
  estimateNumber: string | null;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  onClose: () => void;
  onSent?: () => void;
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function EstimateInvoiceDialog({
  open,
  estimateId,
  estimateNumber,
  customerName,
  customerEmail,
  customerPhone,
  onClose,
  onSent,
}: Props) {
  const [availability, setAvailability] = useState<InvoiceAvailability | null>(null);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState<WorkingAction>(null);
  const [amountType, setAmountType] = useState<AmountType>("PERCENT");
  const [percentage, setPercentage] = useState("50");
  const [fixedAmount, setFixedAmount] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setAvailability(null);
    setAmountType("PERCENT");
    setPercentage("50");
    setFixedAmount("");
    setLoading(true);
    fetch(`/api/estimates/${estimateId}/invoice`)
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "Could not load invoice balance");
        if (cancelled) return;
        const next = data as InvoiceAvailability;
        setAvailability(next);
        setFixedAmount((next.remainingBalance / 2).toFixed(2));
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Could not load invoice balance");
          onClose();
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [estimateId, onClose, open]);

  const amountValue = amountType === "PERCENT" ? Number(percentage) : Number(fixedAmount);
  const invoiceAmount = useMemo(() => {
    if (!availability || !Number.isFinite(amountValue)) return 0;
    return roundCurrency(
      amountType === "PERCENT"
        ? availability.remainingBalance * (amountValue / 100)
        : amountValue
    );
  }, [amountType, amountValue, availability]);

  const amountError = useMemo(() => {
    if (!availability || !Number.isFinite(amountValue) || amountValue <= 0) {
      return "Enter an amount greater than zero.";
    }
    if (amountType === "PERCENT" && amountValue > 100) {
      return "Percentage cannot exceed 100%.";
    }
    if (invoiceAmount > availability.remainingBalance) {
      return `Amount cannot exceed ${money(availability.remainingBalance)}.`;
    }
    if (invoiceAmount < 0.01) return "Invoice amount must be at least $0.01.";
    return null;
  }, [amountType, amountValue, availability, invoiceAmount]);

  async function send(channel: Channel) {
    if (!availability || amountError) return;
    if (channel === "EMAIL" && !customerEmail) {
      toast.error("Customer has no email address");
      return;
    }
    if (channel === "SMS" && !customerPhone) {
      toast.error("Customer has no phone number");
      return;
    }

    setWorking(channel);
    try {
      const response = await fetch(`/api/estimates/${estimateId}/invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          amountType,
          amountValue,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (typeof data.payUrl === "string") {
          await navigator.clipboard.writeText(data.payUrl);
          toast.message(data.error ?? "Invoice delivery is not configured", {
            description: "The invoice payment link was copied to your clipboard.",
          });
        } else {
          toast.error(data.error ?? "Invoice could not be sent");
        }
        return;
      }

      toast.success(
        `${money(invoiceAmount)} invoice sent by ${channel === "EMAIL" ? "email" : "SMS"}`
      );
      onSent?.();
      onClose();
    } catch {
      toast.error("Invoice could not be sent. Check your connection and try again.");
    } finally {
      setWorking(null);
    }
  }

  async function takeCardPayment() {
    if (!availability || amountError) return;
    setWorking("CARD");
    try {
      const response = await fetch(`/api/estimates/${estimateId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: "CARD", amount: invoiceAmount }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data.error ?? "Payment checkout failed");
        return;
      }
      if (typeof data.url === "string") window.location.href = data.url;
    } catch {
      toast.error("Payment checkout failed. Check your connection and try again.");
    } finally {
      setWorking(null);
    }
  }

  async function recordManualPayment(method: "CASH" | "CHECK") {
    if (!availability || amountError) return;
    setWorking(method);
    try {
      const response = await fetch(`/api/estimates/${estimateId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method,
          amount: invoiceAmount,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data.error ?? "Payment could not be recorded");
        return;
      }
      toast.success(`${money(invoiceAmount)} ${method.toLowerCase()} payment recorded`);
      onSent?.();
      onClose();
    } catch {
      toast.error("Payment could not be recorded. Check your connection and try again.");
    } finally {
      setWorking(null);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close invoice dialog"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        disabled={Boolean(working)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="estimate-invoice-title"
        className="relative z-10 max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-xl border bg-background p-6 shadow-xl"
      >
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h2 id="estimate-invoice-title" className="text-lg font-semibold">
              Invoice or take payment
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose a full or partial amount for {estimateNumber ?? "this estimate"}.
            </p>
          </div>
        </div>

        {loading || !availability ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading invoice balance…
          </div>
        ) : (
          <div className="mt-6 space-y-5">
            <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-4 text-sm">
              <div>
                <p className="text-muted-foreground">Approved estimate</p>
                <p className="font-semibold">{money(availability.estimateTotal)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Remaining balance</p>
                <p className="font-semibold">{money(availability.remainingBalance)}</p>
              </div>
              {availability.paid > 0 ? (
                <div className="col-span-2 border-t pt-3">
                  <span className="text-muted-foreground">Already paid: </span>
                  <span className="font-medium">{money(availability.paid)}</span>
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-2 rounded-lg bg-muted p-1">
              <button
                type="button"
                className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                  amountType === "PERCENT" ? "bg-background shadow-sm" : "text-muted-foreground"
                }`}
                onClick={() => setAmountType("PERCENT")}
              >
                Percentage
              </button>
              <button
                type="button"
                className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                  amountType === "FIXED" ? "bg-background shadow-sm" : "text-muted-foreground"
                }`}
                onClick={() => setAmountType("FIXED")}
              >
                Exact amount
              </button>
            </div>

            {amountType === "PERCENT" ? (
              <div className="space-y-3">
                <label className="block text-sm font-medium" htmlFor="invoice-percentage">
                  Percentage of remaining balance
                </label>
                <div className="relative">
                  <Input
                    id="invoice-percentage"
                    type="number"
                    min="0.01"
                    max="100"
                    step="0.01"
                    value={percentage}
                    onChange={(event) => setPercentage(event.target.value)}
                    className="pr-10"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
                    %
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {[25, 50, 75, 100].map((value) => (
                    <Button
                      key={value}
                      type="button"
                      variant={percentage === String(value) ? "default" : "outline"}
                      size="sm"
                      onClick={() => setPercentage(String(value))}
                    >
                      {value}%
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="block text-sm font-medium" htmlFor="invoice-fixed-amount">
                  Exact invoice amount
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
                    $
                  </span>
                  <Input
                    id="invoice-fixed-amount"
                    type="number"
                    min="0.01"
                    max={availability.remainingBalance}
                    step="0.01"
                    value={fixedAmount}
                    onChange={(event) => setFixedAmount(event.target.value)}
                    className="pl-7"
                  />
                </div>
              </div>
            )}

            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-center">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Amount now
              </p>
              <p className="mt-1 text-3xl font-semibold text-foreground">{money(invoiceAmount)}</p>
              {amountError ? <p className="mt-2 text-sm text-destructive">{amountError}</p> : null}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Take payment now</p>
              <div className="grid gap-2 sm:grid-cols-3">
                <Button
                  type="button"
                  onClick={() => void takeCardPayment()}
                  disabled={Boolean(amountError) || Boolean(working)}
                >
                  {working === "CARD" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CreditCard className="h-4 w-4" />
                  )}
                  Enter one-time card
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void recordManualPayment("CASH")}
                  disabled={Boolean(amountError) || Boolean(working)}
                >
                  {working === "CASH" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Banknote className="h-4 w-4" />
                  )}
                  Cash
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void recordManualPayment("CHECK")}
                  disabled={Boolean(amountError) || Boolean(working)}
                >
                  {working === "CHECK" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Banknote className="h-4 w-4" />
                  )}
                  Check
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                One-time card payments use Stripe&apos;s hosted payment screen and do not save the card.
              </p>
            </div>

            <div className="space-y-2 border-t pt-4">
              <p className="text-sm font-medium">Send invoice to {customerName}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void send("SMS")}
                  disabled={Boolean(amountError) || Boolean(working) || !customerPhone}
                >
                  {working === "SMS" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <MessageSquare className="h-4 w-4" />
                  )}
                  Send via SMS
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void send("EMAIL")}
                  disabled={Boolean(amountError) || Boolean(working) || !customerEmail}
                >
                  {working === "EMAIL" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Mail className="h-4 w-4" />
                  )}
                  Send via email
                </Button>
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={Boolean(working)}
              >
                Close
              </Button>
            </div>
            {!customerEmail || !customerPhone ? (
              <p className="text-center text-xs text-muted-foreground">
                {!customerEmail ? "No customer email on file. " : ""}
                {!customerPhone ? "No customer phone on file." : ""}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
