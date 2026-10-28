"use client";

import { useEffect, useMemo, useState } from "react";
import { Banknote, CreditCard, FileText, Loader2, Mail, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AmountType = "PERCENT" | "FIXED";
type WorkingAction = "EMAIL" | "SMS" | "CARD" | "CASH" | "CHECK" | null;

type Availability = {
  visitTotal: number;
  paid: number;
  remainingBalance: number;
};

type Props = {
  open: boolean;
  visitId: string;
  visitTitle: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  onClose: () => void;
  onUpdated?: () => void | Promise<void>;
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function VisitBillingDialog({
  open,
  visitId,
  visitTitle,
  customerName,
  customerEmail,
  customerPhone,
  onClose,
  onUpdated,
}: Props) {
  const [availability, setAvailability] = useState<Availability | null>(null);
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
    fetch(`/api/visits/${visitId}/invoice`)
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "Could not load the job balance");
        if (cancelled) return;
        const next = data as Availability;
        setAvailability(next);
        setFixedAmount((next.remainingBalance / 2).toFixed(2));
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Could not load the job balance");
          onClose();
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [onClose, open, visitId]);

  const amountValue = amountType === "PERCENT" ? Number(percentage) : Number(fixedAmount);
  const selectedAmount = useMemo(() => {
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
    if (amountType === "PERCENT" && amountValue > 100) return "Percentage cannot exceed 100%.";
    if (selectedAmount > availability.remainingBalance) {
      return `Amount cannot exceed ${money(availability.remainingBalance)}.`;
    }
    if (selectedAmount < 0.01) return "Amount must be at least $0.01.";
    return null;
  }, [amountType, amountValue, availability, selectedAmount]);

  const amountPayload = { amountType, amountValue, amount: selectedAmount };

  async function sendInvoice(channel: "EMAIL" | "SMS") {
    if (amountError) return;
    if (channel === "EMAIL" && !customerEmail) return toast.error("Customer has no email address");
    if (channel === "SMS" && !customerPhone) return toast.error("Customer has no phone number");
    setWorking(channel);
    try {
      const response = await fetch(`/api/visits/${visitId}/invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ send: true, channel, ...amountPayload }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (typeof data.payLink === "string" || typeof data.payUrl === "string") {
          await navigator.clipboard.writeText(data.payLink ?? data.payUrl);
          toast.message(data.error ?? "Invoice delivery is not configured", {
            description: "The payment link was copied to your clipboard.",
          });
        } else {
          toast.error(data.error ?? "Invoice could not be sent");
        }
        return;
      }
      toast.success(`${money(selectedAmount)} invoice sent by ${channel === "EMAIL" ? "email" : "SMS"}`);
      await onUpdated?.();
      onClose();
    } catch {
      toast.error("Invoice could not be sent. Check your connection and try again.");
    } finally {
      setWorking(null);
    }
  }

  async function takeCardPayment() {
    if (amountError) return;
    setWorking("CARD");
    try {
      const response = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitId, ...amountPayload }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data.error ?? "Payment checkout failed");
        return;
      }
      if (data.url) window.location.href = data.url;
    } catch {
      toast.error("Payment checkout failed. Check your connection and try again.");
    } finally {
      setWorking(null);
    }
  }

  async function recordManualPayment(method: "CASH" | "CHECK") {
    if (amountError) return;
    setWorking(method);
    try {
      const response = await fetch("/api/payments/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitId,
          method,
          idempotencyKey: crypto.randomUUID(),
          ...amountPayload,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data.error ?? "Payment could not be recorded");
        return;
      }
      toast.success(`${money(selectedAmount)} ${method.toLowerCase()} payment recorded`);
      await onUpdated?.();
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
        aria-label="Close billing dialog"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        disabled={Boolean(working)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="visit-billing-title"
        className="relative z-10 max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto rounded-xl border bg-background p-6 shadow-xl"
      >
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h2 id="visit-billing-title" className="text-lg font-semibold">Invoice or take payment</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose a deposit or progress amount for {visitTitle}.
            </p>
          </div>
        </div>

        {loading || !availability ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading job balance…
          </div>
        ) : (
          <div className="mt-6 space-y-5">
            <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-4 text-sm">
              <div><p className="text-muted-foreground">Job total</p><p className="font-semibold">{money(availability.visitTotal)}</p></div>
              <div><p className="text-muted-foreground">Remaining balance</p><p className="font-semibold">{money(availability.remainingBalance)}</p></div>
              {availability.paid > 0 ? (
                <div className="col-span-2 border-t pt-3"><span className="text-muted-foreground">Already paid: </span><span className="font-medium">{money(availability.paid)}</span></div>
              ) : null}
            </div>

            <div className="grid grid-cols-2 rounded-lg bg-muted p-1">
              <button type="button" className={`rounded-md px-3 py-2 text-sm font-medium ${amountType === "PERCENT" ? "bg-background shadow-sm" : "text-muted-foreground"}`} onClick={() => setAmountType("PERCENT")}>Percentage</button>
              <button type="button" className={`rounded-md px-3 py-2 text-sm font-medium ${amountType === "FIXED" ? "bg-background shadow-sm" : "text-muted-foreground"}`} onClick={() => setAmountType("FIXED")}>Exact amount</button>
            </div>

            {amountType === "PERCENT" ? (
              <div className="space-y-3">
                <label className="block text-sm font-medium" htmlFor="visit-billing-percentage">Percentage of remaining balance</label>
                <div className="relative">
                  <Input id="visit-billing-percentage" type="number" min="0.01" max="100" step="0.01" value={percentage} onChange={(event) => setPercentage(event.target.value)} className="pr-10" />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">%</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {[25, 50, 75, 100].map((value) => <Button key={value} type="button" variant={percentage === String(value) ? "default" : "outline"} size="sm" onClick={() => setPercentage(String(value))}>{value}%</Button>)}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="block text-sm font-medium" htmlFor="visit-billing-fixed">Exact amount</label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">$</span>
                  <Input id="visit-billing-fixed" type="number" min="0.01" max={availability.remainingBalance} step="0.01" value={fixedAmount} onChange={(event) => setFixedAmount(event.target.value)} className="pl-7" />
                </div>
              </div>
            )}

            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-center">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Amount now</p>
              <p className="mt-1 text-3xl font-semibold">{money(selectedAmount)}</p>
              {amountError ? <p className="mt-2 text-sm text-destructive">{amountError}</p> : null}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Take payment now</p>
              <div className="grid gap-2 sm:grid-cols-3">
                <Button type="button" onClick={() => void takeCardPayment()} disabled={Boolean(amountError) || Boolean(working)}>{working === "CARD" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />} Card</Button>
                <Button type="button" variant="outline" onClick={() => void recordManualPayment("CASH")} disabled={Boolean(amountError) || Boolean(working)}>{working === "CASH" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />} Cash</Button>
                <Button type="button" variant="outline" onClick={() => void recordManualPayment("CHECK")} disabled={Boolean(amountError) || Boolean(working)}>{working === "CHECK" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />} Check</Button>
              </div>
            </div>

            <div className="space-y-2 border-t pt-4">
              <p className="text-sm font-medium">Send invoice to {customerName}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button type="button" variant="outline" onClick={() => void sendInvoice("SMS")} disabled={Boolean(amountError) || Boolean(working) || !customerPhone}>{working === "SMS" ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />} Send via SMS</Button>
                <Button type="button" variant="outline" onClick={() => void sendInvoice("EMAIL")} disabled={Boolean(amountError) || Boolean(working) || !customerEmail}>{working === "EMAIL" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Send via email</Button>
              </div>
            </div>

            <div className="flex justify-end"><Button type="button" variant="ghost" onClick={onClose} disabled={Boolean(working)}>Cancel</Button></div>
          </div>
        )}
      </div>
    </div>
  );
}
