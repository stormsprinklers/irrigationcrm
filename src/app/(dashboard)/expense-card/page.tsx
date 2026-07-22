"use client";

import { useEffect, useMemo, useState } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import {
  Elements,
  IssuingCardNumberDisplayElement,
  IssuingCardCvcDisplayElement,
  IssuingCardExpiryDisplayElement,
} from "@stripe/react-stripe-js";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { centsToDollars } from "@/lib/expense-cards/controls";

type CardPayload = {
  card: { id: string; status: string; last4: string | null; stripeCardId: string } | null;
  controls?: {
    dailyLimitCents: number;
    monthlyLimitCents: number;
    blockAtm: boolean;
    blockInternational: boolean;
    blockOnline: boolean;
  };
  clockedIn?: boolean;
  publishableKey?: string;
  ephemeralKeySecret?: string | null;
  stripeCardId?: string;
};

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    centsToDollars(cents)
  );
}

export default function MyExpenseCardPage() {
  const [data, setData] = useState<CardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [stripe, setStripe] = useState<Stripe | null>(null);
  const [ephemeralKeySecret, setEphemeralKeySecret] = useState<string | null>(null);
  const [elementsReady, setElementsReady] = useState(false);

  useEffect(() => {
    fetch("/api/expense-card")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to load card");
        setData(json);
        return json as CardPayload;
      })
      .then(async (json) => {
        if (!json.publishableKey || !json.stripeCardId || json.card?.status !== "ACTIVE") {
          return;
        }
        const stripeJs = await loadStripe(json.publishableKey);
        if (!stripeJs) return;
        setStripe(stripeJs);

        // Mint nonce client-side, then exchange for ephemeral key (PCI-safe Issuing Elements flow).
        const nonceResult = await (
          stripeJs as Stripe & {
            createEphemeralKeyNonce?: (opts: {
              issuingCard: string;
            }) => Promise<{ nonce?: string }>;
          }
        ).createEphemeralKeyNonce?.({
          issuingCard: json.stripeCardId,
        });
        const nonce = nonceResult?.nonce as string | undefined;
        const keyRes = await fetch("/api/expense-card/ephemeral-key", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nonce,
            stripeVersion: (stripeJs as unknown as { _apiVersion?: string })._apiVersion,
          }),
        });
        const keyData = await keyRes.json();
        if (keyRes.ok && keyData.ephemeralKeySecret) {
          setEphemeralKeySecret(keyData.ephemeralKeySecret);
          setElementsReady(true);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const stripePromise = useMemo(() => (stripe ? Promise.resolve(stripe) : null), [stripe]);

  if (loading) {
    return (
      <ContentArea className="max-w-lg">
        <PageHeader breadcrumb={["Expense card"]} title="My expense card" />
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </p>
      </ContentArea>
    );
  }

  if (error) {
    return (
      <ContentArea className="max-w-lg">
        <PageHeader breadcrumb={["Expense card"]} title="My expense card" />
        <p className="text-sm text-destructive">{error}</p>
      </ContentArea>
    );
  }

  if (!data?.card) {
    return (
      <ContentArea className="max-w-lg">
        <PageHeader breadcrumb={["Expense card"]} title="My expense card" />
        <p className="text-sm text-muted-foreground">
          You do not have a company expense card yet. Ask an admin to issue one from Settings →
          Company Expense Cards.
        </p>
      </ContentArea>
    );
  }

  return (
    <ContentArea className="max-w-lg">
      <PageHeader
        breadcrumb={["Expense card"]}
        title="My expense card"
        subtitle="Virtual card for approved on-the-job purchases. Details load securely from Stripe and are never stored in the CRM."
      />

      <div className="space-y-4">
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            data.clockedIn
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-amber-200 bg-amber-50 text-amber-950"
          }`}
        >
          {data.clockedIn
            ? "You are clocked in — this card can be used for approved purchases."
            : "You are not clocked in — purchases will be declined until you clock in."}
        </div>

        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm text-muted-foreground">Status</p>
          <p className="font-semibold">{data.card.status}</p>
          <p className="mt-1 text-sm text-muted-foreground">•••• {data.card.last4}</p>
        </div>

        {data.controls ? (
          <div className="rounded-lg border bg-white p-4 text-sm">
            <p className="font-medium">Spend limits</p>
            <p className="mt-1 text-muted-foreground">
              Daily {formatMoney(data.controls.dailyLimitCents)} · Monthly{" "}
              {formatMoney(data.controls.monthlyLimitCents)}
            </p>
            <ul className="mt-2 list-inside list-disc text-muted-foreground">
              {data.controls.blockAtm ? <li>ATM / cash blocked</li> : null}
              {data.controls.blockInternational ? <li>International blocked</li> : null}
              {data.controls.blockOnline ? <li>Online purchases blocked</li> : null}
            </ul>
          </div>
        ) : null}

        {stripePromise && elementsReady && ephemeralKeySecret && data.stripeCardId ? (
          <div className="rounded-lg border bg-slate-900 p-5 text-white shadow-sm">
            <p className="mb-3 text-xs uppercase tracking-wide text-slate-300">Card details</p>
            <Elements stripe={stripePromise}>
              <div className="space-y-3 font-mono text-lg tracking-wider">
                <div>
                  <p className="text-xs text-slate-400">Number</p>
                  <IssuingCardNumberDisplayElement
                    options={{
                      issuingCard: data.stripeCardId,
                      ephemeralKeySecret,
                      style: { base: { color: "#fff", fontSize: "18px" } },
                    }}
                  />
                </div>
                <div className="flex gap-8">
                  <div>
                    <p className="text-xs text-slate-400">Exp</p>
                    <IssuingCardExpiryDisplayElement
                      options={{
                        issuingCard: data.stripeCardId,
                        ephemeralKeySecret,
                        style: { base: { color: "#fff", fontSize: "16px" } },
                      }}
                    />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">CVC</p>
                    <IssuingCardCvcDisplayElement
                      options={{
                        issuingCard: data.stripeCardId,
                        ephemeralKeySecret,
                        style: { base: { color: "#fff", fontSize: "16px" } },
                      }}
                    />
                  </div>
                </div>
              </div>
            </Elements>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Full card number display is unavailable right now
            {!data.publishableKey ? " (Stripe publishable key not configured)" : ""}.
            {data.card.status !== "ACTIVE" ? " Card must be active." : ""}
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          <Link href="/home" className="text-primary hover:underline">
            Back to home
          </Link>
        </p>
      </div>
    </ContentArea>
  );
}
