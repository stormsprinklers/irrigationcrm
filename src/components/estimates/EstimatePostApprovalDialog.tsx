"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addHours, format } from "date-fns";
import { CalendarClock, Loader2, Mail, MessageSquare } from "lucide-react";
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
  }, [open, initialMode]);

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
      }

      const res = await fetch(`/api/estimates/${estimateId}/post-approval`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
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

  useEffect(() => {
    if (!open || initialMode !== "today" || autoRan.current) return;
    autoRan.current = true;
    void submit("today");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when opened in today mode
  }, [open, initialMode]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
        onClick={() => {
          if (!saving) onClose();
        }}
      />
      <div className="relative z-10 w-full max-w-md rounded-lg border bg-background p-6 shadow-lg">
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
              <Button type="button" disabled={saving} onClick={() => void submit("another_day")}>
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
              <CollectPaymentButton
                visitId={resultVisitId}
                total={depositDue}
                amount={depositDue}
                disabled={Boolean(sendingInvoice)}
              />
              <Button
                type="button"
                variant="outline"
                disabled={Boolean(sendingInvoice) || !customerEmail}
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
                disabled={Boolean(sendingInvoice) || !customerPhone}
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
                disabled={Boolean(sendingInvoice)}
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
