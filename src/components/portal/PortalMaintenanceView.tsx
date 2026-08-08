"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { PortalShell } from "./PortalShell";

type FrequencyOption = {
  frequency: string;
  amount: number;
  label: string;
};

type Enrollment = {
  id: string;
  status: string;
  startDate: string;
  endDate: string | null;
  renewalDate: string | null;
  billingFrequency: string;
  balanceDue: number;
  canCancel?: boolean;
  cancellation?: {
    fee: number;
    feeType: string;
    feeAmount: number | null;
    noticeDays: number;
    policySummary: string;
  };
  frequencyOptions: FrequencyOption[];
  template: {
    name: string;
    basePrice: number;
    allowedBillingFrequencies: string[];
  };
  property: { name: string; address: string | null };
  planVisits: Array<{
    status: string;
    dueYear: number;
    dueMonth: number;
    visitTemplate: { name: string; visitTitle: string; season: string } | null;
    visit: { startAt: string | null; status: string } | null;
  }>;
  billingPeriods: Array<{
    id: string;
    amount: number;
    status: string;
    dueDate: string;
    paidAt: string | null;
    isLate?: boolean;
  }>;
  unpaidPeriods: Array<{
    id: string;
    amount: number;
    dueDate: string;
    status: string;
  }>;
};

type BillingMeta = {
  maintenanceBalanceDue: number;
  hasCardOnFile: boolean;
  card: { brand: string | null; last4: string | null } | null;
};

function money(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function CancelPlanDialog({
  enrollment,
  hasCardOnFile,
  card,
  onClose,
  onCancelled,
  onPayBalance,
}: {
  enrollment: Enrollment;
  hasCardOnFile: boolean;
  card: BillingMeta["card"];
  onClose: () => void;
  onCancelled: () => void;
  onPayBalance: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const fee = enrollment.cancellation?.fee ?? 0;
  const balanceDue = enrollment.balanceDue;
  const blockedByBalance = balanceDue > 0;
  const needsCard = fee > 0 && !hasCardOnFile;

  async function addCard() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/maintenance/card-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enrollmentId: enrollment.id,
          returnPath: `${window.location.pathname}?cancel=${enrollment.id}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not start card setup");
        return;
      }
      if (data.setupUrl) {
        window.location.href = data.setupUrl;
        return;
      }
      setError("Could not open card setup");
    } catch {
      setError("Could not start card setup");
    } finally {
      setBusy(false);
    }
  }

  async function confirmCancel() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/maintenance/${enrollment.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancellationReason: reason.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "BALANCE_DUE") {
          setError(data.error ?? "Pay your outstanding balance first.");
        } else if (data.code === "CARD_REQUIRED") {
          setError(data.error ?? "Add a card on file to pay the cancellation fee.");
        } else {
          setError(data.error ?? "Could not cancel plan");
        }
        return;
      }
      onCancelled();
    } catch {
      setError("Could not cancel plan");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Cancel maintenance plan</h2>
            <p className="mt-1 text-sm text-slate-600">
              {enrollment.template.name} · {enrollment.property.name}
            </p>
          </div>
          <button type="button" className="text-sm text-slate-500 hover:text-slate-800" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="mt-4 space-y-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-800">
          <p>{enrollment.cancellation?.policySummary ?? "Review your company’s cancellation policy below."}</p>
          {balanceDue > 0 ? (
            <p className="font-medium text-amber-950">
              Outstanding balance due first: {money(balanceDue)}
            </p>
          ) : null}
          {fee > 0 ? (
            <p className="font-medium">
              Cancellation fee to charge now: {money(fee)}
              {hasCardOnFile && card?.last4
                ? ` on card ···· ${card.last4}`
                : hasCardOnFile
                  ? " on your card on file"
                  : ""}
            </p>
          ) : (
            <p className="font-medium text-emerald-800">No cancellation fee is due.</p>
          )}
        </div>

        {blockedByBalance ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-slate-700">
              Your plan requires the outstanding balance to be paid before cancellation.
            </p>
            <Button className="w-full bg-storm-coral hover:bg-storm-coral/90" onClick={onPayBalance}>
              Pay {money(balanceDue)} first
            </Button>
            <Button type="button" variant="outline" className="w-full" onClick={onClose}>
              Not now
            </Button>
          </div>
        ) : needsCard ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-slate-700">
              Add a card on file to pay the cancellation fee, then confirm cancellation.
            </p>
            <Button
              className="w-full bg-storm-coral hover:bg-storm-coral/90"
              disabled={busy}
              onClick={() => void addCard()}
            >
              {busy ? "Opening card setup…" : "Add card on file"}
            </Button>
            <Button type="button" variant="outline" className="w-full" onClick={onClose}>
              Not now
            </Button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <label className="block text-sm">
              <span className="font-medium text-slate-800">Reason (optional)</span>
              <textarea
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Tell us why you’re cancelling"
              />
            </label>
            <Button
              className="w-full bg-destructive text-white hover:bg-destructive/90"
              disabled={busy}
              onClick={() => void confirmCancel()}
            >
              {busy
                ? "Cancelling…"
                : fee > 0
                  ? `Pay ${money(fee)} & cancel plan`
                  : "Confirm cancellation"}
            </Button>
            <Button type="button" variant="outline" className="w-full" onClick={onClose}>
              Keep my plan
            </Button>
          </div>
        )}

        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      </div>
    </div>
  );
}

function CheckoutWizard({
  enrollment,
  hasCardOnFile,
  card,
  onClose,
  onPaid,
}: {
  enrollment: Enrollment;
  hasCardOnFile: boolean;
  card: BillingMeta["card"];
  onClose: () => void;
  onPaid: () => void;
}) {
  const preferredDefault =
    enrollment.frequencyOptions.find((o) => o.frequency === enrollment.billingFrequency)?.frequency ??
    enrollment.frequencyOptions.find((o) => o.frequency === "MONTHLY" || o.frequency === "ANNUAL")
      ?.frequency ??
    enrollment.frequencyOptions[0]?.frequency ??
    enrollment.billingFrequency;

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [frequency, setFrequency] = useState(preferredDefault);
  const [cardReady, setCardReady] = useState(hasCardOnFile);
  const [cardInfo, setCardInfo] = useState(card);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalDue = useMemo(
    () => enrollment.unpaidPeriods.reduce((sum, p) => sum + p.amount, 0),
    [enrollment.unpaidPeriods]
  );

  const selectedOption = enrollment.frequencyOptions.find((o) => o.frequency === frequency);

  async function addCard() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/maintenance/card-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enrollmentId: enrollment.id,
          returnPath: `${window.location.pathname}?pay=${enrollment.id}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not start card setup");
        return;
      }
      if (data.alreadyOnFile) {
        setCardReady(true);
        return;
      }
      if (data.setupUrl) {
        window.location.href = data.setupUrl;
        return;
      }
      setError("Could not open card setup");
    } catch {
      setError("Could not start card setup");
    } finally {
      setBusy(false);
    }
  }

  async function confirmPay() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/maintenance/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enrollmentId: enrollment.id,
          billingFrequency: frequency,
          billingPeriodIds: enrollment.unpaidPeriods.map((p) => p.id),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "CARD_REQUIRED") {
          setCardReady(false);
          setStep(2);
        }
        setError(data.error ?? "Payment failed");
        return;
      }
      onPaid();
    } catch {
      setError("Payment failed");
    } finally {
      setBusy(false);
    }
  }

  // Refresh card status if returning from Stripe.
  useEffect(() => {
    if (hasCardOnFile) {
      setCardReady(true);
      setCardInfo(card);
    }
  }, [hasCardOnFile, card]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Checkout · Step {step} of 3
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">{enrollment.template.name}</h2>
            <p className="text-sm text-slate-600">{enrollment.property.name}</p>
          </div>
          <button
            type="button"
            className="text-sm text-slate-500 hover:text-slate-800"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        {step === 1 ? (
          <div className="mt-5 space-y-4">
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Amount due now</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{money(totalDue)}</p>
              <ul className="mt-3 space-y-1 text-sm text-slate-600">
                {enrollment.unpaidPeriods.map((p) => (
                  <li key={p.id}>
                    {money(p.amount)} · due {format(new Date(p.dueDate), "MMM d, yyyy")}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-sm font-medium text-slate-900">Ongoing billing preference</p>
              <p className="mt-1 text-sm text-slate-600">
                Choose how you want future plan payments billed after this balance is paid.
              </p>
              <div className="mt-3 space-y-2">
                {(enrollment.frequencyOptions.some(
                  (o) => o.frequency === "MONTHLY" || o.frequency === "ANNUAL"
                )
                  ? enrollment.frequencyOptions.filter(
                      (o) => o.frequency === "MONTHLY" || o.frequency === "ANNUAL"
                    )
                  : enrollment.frequencyOptions
                ).map((option) => (
                    <label
                      key={option.frequency}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                        frequency === option.frequency
                          ? "border-storm-coral bg-orange-50/40"
                          : "border-slate-200"
                      }`}
                    >
                      <input
                        type="radio"
                        className="mt-1"
                        name="billingFrequency"
                        checked={frequency === option.frequency}
                        onChange={() => setFrequency(option.frequency)}
                      />
                      <span>
                        <span className="block font-medium text-slate-900">
                          Pay {option.label.toLowerCase()}
                        </span>
                        <span className="text-sm text-slate-600">
                          {money(option.amount)}
                          {option.frequency === "MONTHLY"
                            ? " / month"
                            : option.frequency === "QUARTERLY"
                              ? " / quarter"
                              : " / year"}{" "}
                          going forward
                        </span>
                      </span>
                    </label>
                  ))}
              </div>
            </div>

            <Button
              className="w-full bg-storm-coral hover:bg-storm-coral/90"
              onClick={() => setStep(2)}
            >
              Continue
            </Button>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="mt-5 space-y-4">
            <div className="rounded-lg border border-slate-200 p-4">
              <p className="text-sm font-medium text-slate-900">Card on file</p>
              {cardReady && cardInfo?.last4 ? (
                <p className="mt-2 text-sm text-slate-700">
                  {(cardInfo.brand ?? "Card").toString()} ending in {cardInfo.last4}
                </p>
              ) : cardReady ? (
                <p className="mt-2 text-sm text-emerald-700">Card on file is ready.</p>
              ) : (
                <p className="mt-2 text-sm text-slate-600">
                  Add a card to pay this balance and keep your plan current.
                </p>
              )}
            </div>
            {!cardReady ? (
              <Button
                className="w-full bg-storm-coral hover:bg-storm-coral/90"
                disabled={busy}
                onClick={() => void addCard()}
              >
                {busy ? "Opening secure card setup…" : "Add card on file"}
              </Button>
            ) : (
              <Button
                className="w-full bg-storm-coral hover:bg-storm-coral/90"
                onClick={() => setStep(3)}
              >
                Continue to confirm
              </Button>
            )}
            <Button type="button" variant="outline" className="w-full" onClick={() => setStep(1)}>
              Back
            </Button>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="mt-5 space-y-4">
            <div className="rounded-lg bg-slate-50 p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">Paying now</span>
                <span className="font-semibold text-slate-900">{money(totalDue)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Going forward</span>
                <span className="font-medium text-slate-900">
                  {selectedOption
                    ? `${selectedOption.label} · ${money(selectedOption.amount)}${
                        selectedOption.frequency === "MONTHLY" ? "/mo" : "/yr"
                      }`
                    : frequency}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Card</span>
                <span className="font-medium text-slate-900">
                  {cardInfo?.last4
                    ? `${cardInfo.brand ?? "Card"} ···· ${cardInfo.last4}`
                    : "Card on file"}
                </span>
              </div>
            </div>
            <p className="text-xs text-slate-500">
              By confirming, you authorize {money(totalDue)} to be charged to your card on file for
              maintenance plan billing.
            </p>
            <Button
              className="w-full bg-storm-coral hover:bg-storm-coral/90"
              disabled={busy}
              onClick={() => void confirmPay()}
            >
              {busy ? "Processing…" : `Pay ${money(totalDue)}`}
            </Button>
            <Button type="button" variant="outline" className="w-full" onClick={() => setStep(2)}>
              Back
            </Button>
          </div>
        ) : null}

        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      </div>
    </div>
  );
}

export function PortalMaintenanceView({ slug }: { slug: string }) {
  const [me, setMe] = useState<{
    company: { name: string; emailLogoUrl: string | null; features: Record<string, boolean> };
  } | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [billing, setBilling] = useState<BillingMeta | null>(null);
  const [checkoutId, setCheckoutId] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [meData, maintData] = await Promise.all([
      fetch("/api/portal/me").then((r) => r.json()),
      fetch("/api/portal/maintenance").then((r) => r.json()),
    ]);
    setMe(meData);
    setEnrollments(maintData.enrollments ?? []);
    setBilling(maintData.billing ?? null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("card") === "success") {
      setMessage("Card saved. You can finish checkout below.");
      void load().then(() => {
        const payId = params.get("pay");
        const cancelEnrollmentId = params.get("cancel");
        if (payId) setCheckoutId(payId);
        if (cancelEnrollmentId) setCancelId(cancelEnrollmentId);
      });
    }
  }, [load]);

  const checkoutEnrollment = enrollments.find((e) => e.id === checkoutId) ?? null;
  const cancelEnrollment = enrollments.find((e) => e.id === cancelId) ?? null;

  if (!me) return <p className="text-sm text-muted-foreground">Loading...</p>;

  return (
    <PortalShell
      slug={slug}
      companyName={me.company.name}
      emailLogoUrl={me.company.emailLogoUrl}
      features={me.company.features as never}
    >
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Maintenance plans</h1>

        {message ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {message}
          </div>
        ) : null}

        {billing && billing.maintenanceBalanceDue > 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4">
            <p className="font-semibold text-amber-950">
              Balance due: {money(billing.maintenanceBalanceDue)}
            </p>
            <p className="mt-1 text-sm text-amber-900/80">
              Pay your plan balance and choose monthly or annual billing going forward.
            </p>
            {!billing.hasCardOnFile ? (
              <p className="mt-2 text-sm text-amber-900/80">A card on file is required to pay.</p>
            ) : billing.card?.last4 ? (
              <p className="mt-2 text-sm text-amber-900/80">
                Card on file: {(billing.card.brand ?? "Card").toString()} ···· {billing.card.last4}
              </p>
            ) : null}
          </div>
        ) : null}

        {enrollments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No maintenance plan enrollments.</p>
        ) : (
          enrollments.map((e) => (
            <div key={e.id} className="space-y-3 rounded-lg border border-border bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{e.template.name}</p>
                  <p className="text-sm text-muted-foreground">{e.property.name}</p>
                  <p className="text-sm capitalize">
                    {e.status.toLowerCase()} · {e.billingFrequency.toLowerCase()}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {e.balanceDue > 0 ? (
                    <Button
                      className="bg-storm-coral hover:bg-storm-coral/90"
                      onClick={() => setCheckoutId(e.id)}
                    >
                      Pay {money(e.balanceDue)}
                    </Button>
                  ) : null}
                  {e.canCancel ? (
                    <Button variant="outline" onClick={() => setCancelId(e.id)}>
                      Cancel plan
                    </Button>
                  ) : null}
                </div>
              </div>

              {e.balanceDue > 0 ? (
                <div className="rounded-md border border-amber-100 bg-amber-50/60 px-3 py-2 text-sm">
                  <p className="font-medium text-amber-950">Amount due: {money(e.balanceDue)}</p>
                  <ul className="mt-1 space-y-0.5 text-amber-900/80">
                    {e.unpaidPeriods.map((p) => (
                      <li key={p.id}>
                        {money(p.amount)} due {format(new Date(p.dueDate), "MMM d, yyyy")} —{" "}
                        {p.status.toLowerCase()}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div>
                <p className="text-sm font-medium">Upcoming visits</p>
                <ul className="mt-1 space-y-1 text-sm">
                  {e.planVisits
                    .filter((pv) => pv.status !== "COMPLETED")
                    .slice(0, 4)
                    .map((pv, i) => (
                      <li key={i}>
                        {pv.visitTemplate?.visitTitle ?? "Plan visit"} —{" "}
                        {pv.visit?.startAt
                          ? format(new Date(pv.visit.startAt), "MMM d, yyyy")
                          : `${pv.dueMonth}/${pv.dueYear}`}
                      </li>
                    ))}
                </ul>
              </div>
              <div>
                <p className="text-sm font-medium">Billing</p>
                <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                  {e.billingPeriods.slice(-3).map((bp) => (
                    <li key={bp.id}>
                      ${bp.amount.toFixed(2)} due {format(new Date(bp.dueDate), "MMM d, yyyy")} —{" "}
                      {bp.status.toLowerCase()}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))
        )}
      </div>

      {checkoutEnrollment ? (
        <CheckoutWizard
          enrollment={checkoutEnrollment}
          hasCardOnFile={Boolean(billing?.hasCardOnFile)}
          card={billing?.card ?? null}
          onClose={() => setCheckoutId(null)}
          onPaid={() => {
            setCheckoutId(null);
            setMessage("Payment successful — thank you!");
            void load();
          }}
        />
      ) : null}

      {cancelEnrollment ? (
        <CancelPlanDialog
          enrollment={cancelEnrollment}
          hasCardOnFile={Boolean(billing?.hasCardOnFile)}
          card={billing?.card ?? null}
          onClose={() => setCancelId(null)}
          onPayBalance={() => {
            setCancelId(null);
            setCheckoutId(cancelEnrollment.id);
          }}
          onCancelled={() => {
            setCancelId(null);
            setMessage("Your maintenance plan has been cancelled.");
            void load();
          }}
        />
      ) : null}
    </PortalShell>
  );
}
