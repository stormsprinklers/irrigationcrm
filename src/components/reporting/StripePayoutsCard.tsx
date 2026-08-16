"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Landmark, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type {
  PayoutPaymentLine,
  StripePayoutRow,
  StripePayoutsSummary,
} from "@/lib/stripe/payout-types";
import { cn } from "@/lib/utils";

function formatCents(cents: number, currency = "usd") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

function formatDay(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function payoutStatusLabel(status: string) {
  switch (status) {
    case "paid":
      return "Paid";
    case "pending":
      return "Scheduled";
    case "in_transit":
      return "In transit";
    case "canceled":
      return "Canceled";
    case "failed":
      return "Failed";
    default:
      return status.replace(/_/g, " ");
  }
}

function payoutStatusVariant(status: string): "success" | "secondary" | "destructive" | "outline" {
  if (status === "paid") return "success";
  if (status === "failed" || status === "canceled") return "destructive";
  if (status === "in_transit" || status === "pending") return "secondary";
  return "outline";
}

function cardHeadline(summary: StripePayoutsSummary) {
  if (summary.nextPayout) {
    return {
      amount: formatCents(summary.nextPayout.amountCents, summary.nextPayout.currency),
      hint: summary.nextPayout.status === "in_transit"
        ? `In transit · arrives ${formatDay(summary.nextPayout.arrivalDate)}`
        : `Scheduled · arrives ${formatDay(summary.nextPayout.arrivalDate)}`,
    };
  }
  return {
    amount: formatCents(summary.unpaidCents),
    hint: summary.unpaidCents > 0 ? "In Stripe · awaiting next payout" : "No funds waiting to pay out",
  };
}

function PaymentLines({
  lines,
  empty,
  loading,
}: {
  lines: PayoutPaymentLine[];
  empty: string;
  loading?: boolean;
}) {
  if (loading) {
    return <p className="mt-2 text-xs text-muted-foreground">Loading payments…</p>;
  }
  if (lines.length === 0) {
    return <p className="mt-2 text-xs text-muted-foreground">{empty}</p>;
  }
  return (
    <ul className="mt-2 space-y-1.5 border-t border-border pt-2">
      {lines.map((line, index) => (
        <li key={`${line.paidAt}-${line.customerName}-${index}`} className="flex items-start justify-between gap-3 text-sm">
          <div className="min-w-0">
            <p className="truncate">{line.customerName}</p>
            <p className="text-xs text-muted-foreground">
              {formatDay(line.paidAt)}
              {line.method === "CASH" ? " · Cash" : line.method === "CHECK" ? " · Check" : ""}
            </p>
          </div>
          <p className="shrink-0 font-medium">{formatCents(line.amountCents)}</p>
        </li>
      ))}
    </ul>
  );
}

export function StripePayoutsCard() {
  const [summary, setSummary] = useState<StripePayoutsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/stripe/payouts");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load payouts");
        if (!cancelled) {
          setSummary(data as StripePayoutsSummary);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load payouts");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const headline = summary ? cardHeadline(summary) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => summary && setOpen(true)}
        disabled={!summary}
        className="w-full text-left disabled:cursor-default"
      >
        <Card className={cn("transition-colors", summary && "hover:bg-muted/40")}>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Landmark className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Payouts
              </p>
              {loading ? (
                <p className="mt-1 text-sm text-muted-foreground">Loading Stripe payouts…</p>
              ) : error ? (
                <p className="mt-1 text-sm text-destructive">{error}</p>
              ) : headline ? (
                <>
                  <p className="mt-0.5 text-2xl font-semibold">{headline.amount}</p>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">{headline.hint}</p>
                </>
              ) : null}
            </div>
            {summary ? (
              <span className="shrink-0 text-sm font-medium text-primary">View history</span>
            ) : null}
          </CardContent>
        </Card>
      </button>

      {open && summary ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close payouts"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="payouts-dialog-title"
            className="relative flex max-h-[min(40rem,90vh)] w-full max-w-xl flex-col rounded-lg border border-border bg-white shadow-lg"
          >
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <h2 id="payouts-dialog-title" className="text-base font-semibold">
                  Stripe payouts
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Funds still in Stripe, cash and checks recorded in the CRM, and recent bank deposits.
                </p>
              </div>
              <Button type="button" variant="ghost" size="icon" aria-label="Close" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-3 border-b border-border px-5 py-4">
              <div>
                <p className="text-xs text-muted-foreground">Yet to be paid out</p>
                <p className="mt-1 text-xl font-semibold">{formatCents(summary.unpaidCents)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Clearing / available</p>
                <p className="mt-1 text-sm font-medium">
                  {formatCents(summary.pendingCents)} pending
                </p>
                <p className="text-sm text-muted-foreground">
                  {formatCents(summary.availableCents)} ready
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Cash / checks expected</p>
                <p className="mt-1 text-xl font-semibold">
                  {formatCents(summary.cashCheckExpectedCents)}
                </p>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col px-5 py-4">
              <p className="mb-2 text-sm font-medium">Payout history</p>
              <ScrollArea className="h-72 pr-3">
                <ul className="divide-y divide-border">
                  <CashCheckHistoryRow
                    amountCents={summary.cashCheckExpectedCents}
                    payments={summary.cashCheckPayments}
                  />
                  {summary.payouts.length === 0 ? (
                    <li className="py-3 text-sm text-muted-foreground">No Stripe payouts yet.</li>
                  ) : (
                    summary.payouts.map((payout) => (
                      <PayoutHistoryRow key={payout.id} payout={payout} />
                    ))
                  )}
                </ul>
              </ScrollArea>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function CashCheckHistoryRow({
  amountCents,
  payments,
}: {
  amountCents: number;
  payments: PayoutPaymentLine[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className="py-3">
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 text-left"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <div className="min-w-0">
          <p className="font-medium">{formatCents(amountCents)}</p>
          <p className="text-xs text-muted-foreground">Cash / checks expected</p>
        </div>
        <span className="flex shrink-0 items-center gap-2">
          <Badge variant="outline">CRM</Badge>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
        </span>
      </button>
      {open ? (
        <PaymentLines
          lines={payments}
          empty="No cash or check payments recorded."
        />
      ) : null}
    </li>
  );
}

function PayoutHistoryRow({ payout }: { payout: StripePayoutRow }) {
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<PayoutPaymentLine[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (!next || lines) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/stripe/payouts/${payout.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load payments");
      setLines(data.payments ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load payments");
    } finally {
      setLoading(false);
    }
  }

  return (
    <li className="py-3">
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 text-left"
        aria-expanded={open}
        onClick={() => void toggle()}
      >
        <div className="min-w-0">
          <p className="font-medium">{formatCents(payout.amountCents, payout.currency)}</p>
          <p className="text-xs text-muted-foreground">
            {payout.status === "paid"
              ? `Arrived ${formatDay(payout.arrivalDate)}`
              : `Expected ${formatDay(payout.arrivalDate)}`}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-2">
          <Badge variant={payoutStatusVariant(payout.status)} className="capitalize">
            {payoutStatusLabel(payout.status)}
          </Badge>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
        </span>
      </button>
      {open ? (
        error ? (
          <p className="mt-2 text-xs text-destructive">{error}</p>
        ) : (
          <PaymentLines
            lines={lines ?? []}
            empty="No customer charges found on this payout."
            loading={loading}
          />
        )
      ) : null}
    </li>
  );
}
