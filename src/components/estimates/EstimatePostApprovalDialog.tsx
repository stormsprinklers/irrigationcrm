"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addHours, format } from "date-fns";
import { CalendarClock, CreditCard, Loader2, Mail, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CollectPaymentButton } from "@/components/payments/CollectPaymentButton";

type Props = {
  open: boolean;
  estimateId: string;
  estimateTotal: number;
  linkedVisitId: string | null;
  optionId: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  /** choose = ask; today = complete today immediately; schedule = date picker */
  initialMode?: "choose" | "today" | "schedule";
  onClose: () => void;
  onConverted: (visitId: string) => void;
};

type Step = "timing" | "schedule" | "deposit";

type SchedulingBillingStatus = {
  hasPayment: boolean;
  hasCardOnFile: boolean;
  cardCheckFailed: boolean;
  canWaiveCardOnFile: boolean;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function toLocalInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function EstimatePostApprovalDialog({
  open,
  estimateId,
  estimateTotal,
  linkedVisitId,
  optionId,
  customerEmail,
  customerPhone,
  initialMode = "choose",
  onClose,
  onConverted,
}: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("timing");
  const [saving, setSaving] = useState(false);
  const [startLocal, setStartLocal] = useState(() => toLocalInputValue(addHours(new Date(), 24)));
  const [endLocal, setEndLocal] = useState(() =>
    toLocalInputValue(addHours(addHours(new Date(), 24), 2))
  );
  const [threshold, setThreshold] = useState(1000);
  const [percent, setPercent] = useState(50);
  const [resultVisitId, setResultVisitId] = useState<string | null>(null);
  const [depositDue, setDepositDue] = useState(0);
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const [sendingInvoice, setSendingInvoice] = useState<"EMAIL" | "SMS" | null>(null);
  const [chargingCardOnFile, setChargingCardOnFile] = useState(false);
  const [confirmCardCharge, setConfirmCardCharge] = useState(false);
  const [billingStatus, setBillingStatus] = useState<SchedulingBillingStatus | null>(null);
  const [billingStatusError, setBillingStatusError] = useState<string | null>(null);
  const [waiveCardOnFile, setWaiveCardOnFile] = useState(false);
  const autoRan = useRef(false);

  useEffect(() => {
    if (!open) {
      autoRan.current = false;
      return;
    }
    setResultVisitId(null);
    setDepositDue(0);
    setNotifyCustomer(true);
    setSendingInvoice(null);
    setChargingCardOnFile(false);
    setConfirmCardCharge(false);
    setBillingStatus(null);
    setBillingStatusError(null);
    setWaiveCardOnFile(false);
    const start = addHours(new Date(), 24);
    setStartLocal(toLocalInputValue(start));
    setEndLocal(toLocalInputValue(addHours(start, 2)));
    setStep(initialMode === "schedule" ? "schedule" : "timing");
    fetch("/api/settings/estimates")
      .then((r) => r.json())
      .then((data) => {
        if (data?.deferredVisitDepositThreshold != null) {
          setThreshold(Number(data.deferredVisitDepositThreshold));
        }
        if (data?.deferredVisitDepositPercent != null) {
          setPercent(Number(data.deferredVisitDepositPercent));
        }
      })
      .catch(() => undefined);
    fetch(`/api/estimates/${estimateId}/post-approval`)
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "Could not check payment status");
        setBillingStatus(data as SchedulingBillingStatus);
      })
      .catch((error) => {
        setBillingStatusError(
          error instanceof Error ? error.message : "Could not check payment status"
        );
      });
  }, [open, initialMode, estimateId]);

  const previewDeposit = useMemo(() => {
    if (estimateTotal <= threshold) return 0;
    return Math.round(estimateTotal * (percent / 100) * 100) / 100;
  }, [estimateTotal, threshold, percent]);

  async function submit(timing: "today" | "another_day") {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        timing,
        ...(optionId ? { optionId } : {}),
        ...(linkedVisitId ? { visitId: linkedVisitId } : {}),
      };

      if (timing === "another_day") {
        const startAt = new Date(startLocal);
        const endAt = new Date(endLocal);
        if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
          toast.error("Choose a valid start and end time");
          return;
        }
        body.schedule = {
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          division: "SERVICE",
        };
        body.notifyCustomer = notifyCustomer;
        body.waiveCardOnFile = waiveCardOnFile;
      }

      const res = await fetch(`/api/estimates/${estimateId}/post-approval`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === "CARD_ON_FILE_WAIVER_REQUIRED") {
          setBillingStatus((current) => ({
            hasPayment: false,
            hasCardOnFile: false,
            cardCheckFailed: current?.cardCheckFailed ?? false,
            canWaiveCardOnFile: current?.canWaiveCardOnFile ?? false,
          }));
        }
        toast.error(data.error ?? "Failed to schedule work");
        return;
      }

      setResultVisitId(data.visitId);
      onConverted(data.visitId);

      if (timing === "today") {
        toast.success("Line items added to today's visit");
        router.push(`/visits/${data.visitId}`);
        onClose();
        return;
      }

      const due = Number(data.depositDue ?? 0);
      setDepositDue(due);
      if (due > 0) {
        setStep("deposit");
        toast.success("Visit scheduled — collect deposit");
      } else {
        toast.success("Visit scheduled");
        router.push(`/visits/${data.visitId}`);
        onClose();
      }
    } finally {
      setSaving(false);
    }
  }

  async function sendDepositInvoice(channel: "EMAIL" | "SMS") {
    if (depositDue <= 0 || sendingInvoice) return;

    setSendingInvoice(channel);
    try {
      const response = await fetch(`/api/estimates/${estimateId}/invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          amountType: "FIXED",
          amountValue: depositDue,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (typeof data.payUrl === "string") {
          await navigator.clipboard.writeText(data.payUrl);
          toast.message(data.error ?? "Invoice delivery is not configured", {
            description: "The payable invoice link was copied to your clipboard.",
          });
        } else {
          toast.error(data.error ?? "Deposit invoice could not be sent");
        }
        return;
      }

      toast.success(
        `${formatCurrency(depositDue)} deposit invoice sent by ${channel === "EMAIL" ? "email" : "text"}`
      );
      router.push(`/visits/${resultVisitId}`);
      onClose();
    } catch {
      toast.error("Deposit invoice could not be sent. Check your connection and try again.");
    } finally {
      setSendingInvoice(null);
    }
  }

  async function chargeDepositToCardOnFile() {
    if (!resultVisitId || depositDue <= 0 || chargingCardOnFile) return;

    setChargingCardOnFile(true);
    try {
      const response = await fetch("/api/payments/card-on-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitId: resultVisitId,
          amountType: "FIXED",
          amountValue: depositDue,
          amount: depositDue,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (data.code === "PAYMENT_REQUIRES_CUSTOMER" && typeof data.payLink === "string") {
          await navigator.clipboard.writeText(data.payLink).catch(() => {});
          toast.error(data.error ?? "Customer authentication is required", {
            description: "The customer payment link was copied to your clipboard.",
          });
        } else {
          toast.error(data.error ?? "The saved card could not be charged");
        }
        return;
      }

      toast.success(`${formatCurrency(Number(data.amount ?? depositDue))} charged to card on file`);
      setConfirmCardCharge(false);
      router.push(`/visits/${resultVisitId}`);
      onClose();
    } catch {
      toast.error("The card charge could not be confirmed. Check the invoice before retrying.");
    } finally {
      setChargingCardOnFile(false);
    }
  }

  useEffect(() => {
    if (!open || initialMode !== "today" || autoRan.current) return;
    autoRan.current = true;
    void submit("today");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when opened in today mode
  }, [open, initialMode]);

  if (!open) return null;

  const requiresCardWaiver = Boolean(
    billingStatus && !billingStatus.hasPayment && !billingStatus.hasCardOnFile
  );
  const scheduleDisabled =
    saving ||
    !billingStatus ||
    Boolean(billingStatusError) ||
    (requiresCardWaiver && (!billingStatus.canWaiveCardOnFile || !waiveCardOnFile));

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
        onClick={() => {
          if (!saving && !chargingCardOnFile) onClose();
        }}
      />
      <div className="relative z-10 max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-lg border bg-background p-6 shadow-lg">
        {initialMode === "today" && step === "timing" ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Completing work today…
          </div>
        ) : null}

        {step === "timing" && initialMode !== "today" ? (
          <>
            <h2 className="text-lg font-semibold">When is this work happening?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Are you completing this work today, or another day?
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <Button type="button" disabled={saving} onClick={() => void submit("today")}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Complete Today
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => setStep("schedule")}
              >
                <CalendarClock className="h-4 w-4" />
                Schedule Visit
              </Button>
            </div>
          </>
        ) : null}

        {step === "schedule" ? (
          <>
            <h2 className="text-lg font-semibold">Schedule Visit</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Choose a day and time. Estimate total: {formatCurrency(estimateTotal)}.
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Start</label>
                <Input
                  type="datetime-local"
                  value={startLocal}
                  onChange={(e) => {
                    setStartLocal(e.target.value);
                    const start = new Date(e.target.value);
                    if (!Number.isNaN(start.getTime())) {
                      setEndLocal(toLocalInputValue(addHours(start, 2)));
                    }
                  }}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">End</label>
                <Input
                  type="datetime-local"
                  value={endLocal}
                  onChange={(e) => setEndLocal(e.target.value)}
                />
              </div>
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                {previewDeposit > 0 ? (
                  <>
                    <p className="font-medium">Deposit due: {formatCurrency(previewDeposit)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Totals over {formatCurrency(threshold)} require a {percent}% deposit when
                      booking for another day.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-medium">No deposit required</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      This visit is at or under the {formatCurrency(threshold)} threshold.
                    </p>
                  </>
                )}
              </div>
              {!billingStatus && !billingStatusError ? (
                <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Checking payment and card status…
                </div>
              ) : null}
              {billingStatusError ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {billingStatusError}. Close this window and try again before scheduling.
                </div>
              ) : null}
              {requiresCardWaiver ? (
                <label className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-950">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={waiveCardOnFile}
                    disabled={!billingStatus?.canWaiveCardOnFile}
                    onChange={(event) => setWaiveCardOnFile(event.target.checked)}
                  />
                  <span>
                    <span className="block font-semibold">
                      Waive card on file and schedule anyway
                    </span>
                    <span className="mt-1 block text-xs text-amber-900/80">
                      {billingStatus?.cardCheckFailed
                        ? "The saved-card status could not be verified and no payment was found. "
                        : "No partial payment or saved card was found. "}
                      This waiver will be recorded with your employee account and does not waive the
                      customer&apos;s outstanding balance.
                    </span>
                    {!billingStatus?.canWaiveCardOnFile ? (
                      <span className="mt-1 block text-xs font-medium">
                        A CSR, manager, or administrator must approve this waiver.
                      </span>
                    ) : null}
                  </span>
                </label>
              ) : null}
              <label className="flex items-start gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={notifyCustomer}
                  onChange={(event) => setNotifyCustomer(event.target.checked)}
                />
                <span>
                  <span className="block font-medium">Notify customer</span>
                  <span className="block text-xs text-muted-foreground">
                    Send the scheduled-visit notification after saving.
                  </span>
                </span>
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              {initialMode === "choose" ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={() => setStep("timing")}
                >
                  Back
                </Button>
              ) : (
                <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
                  Cancel
                </Button>
              )}
              <Button
                type="button"
                disabled={scheduleDisabled}
                onClick={() => void submit("another_day")}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Schedule Visit
              </Button>
            </div>
          </>
        ) : null}

        {step === "deposit" && resultVisitId ? (
          <>
            <h2 className="text-lg font-semibold">Collect deposit</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Visit scheduled
              {startLocal ? ` for ${format(new Date(startLocal), "MMM d, yyyy h:mm a")}` : ""}.
              Collect {formatCurrency(depositDue)} now ({percent}% of {formatCurrency(estimateTotal)}
              ).
            </p>
            <div className="mt-6 flex flex-col gap-2">
              {billingStatus?.hasCardOnFile ? (
                <>
                  <Button
                    type="button"
                    disabled={Boolean(sendingInvoice) || chargingCardOnFile}
                    onClick={() => setConfirmCardCharge(true)}
                  >
                    {chargingCardOnFile ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CreditCard className="h-4 w-4" />
                    )}
                    Charge card on file · {formatCurrency(depositDue)}
                  </Button>
                  {confirmCardCharge ? (
                    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-left text-amber-950">
                      <p className="font-semibold">
                        Charge {formatCurrency(depositDue)} now?
                      </p>
                      <p className="mt-1 text-xs text-amber-900/80">
                        This will charge the customer&apos;s saved card and apply the payment to the
                        visit invoice.
                      </p>
                      <div className="mt-3 flex justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={chargingCardOnFile}
                          onClick={() => setConfirmCardCharge(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={chargingCardOnFile}
                          onClick={() => void chargeDepositToCardOnFile()}
                        >
                          {chargingCardOnFile ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <CreditCard className="h-4 w-4" />
                          )}
                          Confirm charge
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : null}
              <CollectPaymentButton
                visitId={resultVisitId}
                total={depositDue}
                amount={depositDue}
                disabled={Boolean(sendingInvoice) || chargingCardOnFile}
              />
              <Button
                type="button"
                variant="outline"
                disabled={Boolean(sendingInvoice) || chargingCardOnFile || !customerEmail}
                onClick={() => void sendDepositInvoice("EMAIL")}
              >
                {sendingInvoice === "EMAIL" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="h-4 w-4" />
                )}
                Send {formatCurrency(depositDue)} invoice by email
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={Boolean(sendingInvoice) || chargingCardOnFile || !customerPhone}
                onClick={() => void sendDepositInvoice("SMS")}
              >
                {sendingInvoice === "SMS" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MessageSquare className="h-4 w-4" />
                )}
                Text {formatCurrency(depositDue)} invoice
              </Button>
              {!customerEmail || !customerPhone ? (
                <p className="px-1 text-xs text-muted-foreground">
                  {!customerEmail ? "Add an email to the customer to send by email. " : ""}
                  {!customerPhone ? "Add a phone number to the customer to send by text." : ""}
                </p>
              ) : null}
              <Button
                type="button"
                variant="outline"
                disabled={Boolean(sendingInvoice) || chargingCardOnFile}
                onClick={() => {
                  router.push(`/visits/${resultVisitId}`);
                  onClose();
                }}
              >
                Go to visit
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
