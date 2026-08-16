"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { EstimateOptionPresentCards } from "@/components/estimates/EstimateOptionPresentCards";

type EstimateLike = {
  id: string;
  status: string;
  financingUrl?: string | null;
  options: Array<{
    id: string;
    label: string;
    description: string | null;
    photoUrl: string | null;
    total: number;
    declinedAt?: string | null;
  }>;
  lineItems: Array<{
    optionId?: string | null;
    name: string;
    description: string | null;
    quantity: number;
    unitPrice: number;
    unit?: string;
    total: number;
  }>;
  discounts: Array<{
    optionId?: string | null;
    label: string | null;
    type: string;
    amount: number;
  }>;
};

export function EstimatePresentMode({
  estimateId,
  open,
  onClose,
  onSaveAndSend,
  onApproved,
  onRequestSignature,
}: {
  estimateId: string;
  open: boolean;
  onClose: (estimate?: EstimateLike) => void;
  onSaveAndSend: (estimate: EstimateLike) => void;
  onApproved?: (estimate: EstimateLike) => void;
  onRequestSignature?: (optionId: string, estimate: EstimateLike) => void;
}) {
  const [estimate, setEstimate] = useState<EstimateLike | null>(null);
  const [loading, setLoading] = useState(false);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [financingSending, setFinancingSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/estimates/${estimateId}/present`, { method: "POST" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Could not prepare presentation");
        if (!cancelled) setEstimate(data);
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Could not prepare presentation");
        onClose();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, estimateId]);

  if (!open) return null;

  async function approve(optionId: string) {
    if (!estimate) return;
    setDecidingId(optionId);
    try {
      const res = await fetch(`/api/estimates/${estimateId}/options`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionId, select: true }),
      });
      if (!res.ok) throw new Error("Could not select option");
      const data = (await res.json()) as EstimateLike;
      setEstimate(data);
      onApproved?.(data);
      onRequestSignature?.(optionId, data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setDecidingId(null);
    }
  }

  async function decline(optionId: string) {
    setDecidingId(optionId);
    try {
      const res = await fetch(`/api/estimates/${estimateId}/options`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionId, declined: true }),
      });
      if (!res.ok) throw new Error("Could not decline option");
      setEstimate((await res.json()) as EstimateLike);
      toast.success("Option declined");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setDecidingId(null);
    }
  }

  async function sendFinancingText() {
    setFinancingSending(true);
    try {
      const res = await fetch(`/api/estimates/${estimateId}/financing`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Could not send financing text");
        return;
      }
      toast.success("Financing options texted to the customer");
    } finally {
      setFinancingSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#eef1f4]">
      <div className="mx-auto flex min-h-full max-w-6xl flex-col px-4 py-4">
        <div className="mb-6 flex items-center justify-between gap-3">
          <button type="button" onClick={() => onClose(estimate ?? undefined)} aria-label="Close">
            <X className="h-6 w-6" />
          </button>
          <h1 className="text-xl font-semibold">Present estimate</h1>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onClose(estimate ?? undefined)}>
              Save
            </Button>
            <Button
              disabled={!estimate}
              onClick={() => {
                if (estimate) onSaveAndSend(estimate);
              }}
            >
              Save and send
            </Button>
            {estimate?.financingUrl ? (
              <Button
                variant="secondary"
                disabled={financingSending}
                onClick={() => void sendFinancingText()}
              >
                {financingSending ? "Texting…" : "Explore financing options"}
              </Button>
            ) : null}
          </div>
        </div>
        {loading || !estimate ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Preparing photos and descriptions…
          </div>
        ) : (
          <EstimateOptionPresentCards
            options={estimate.options.map((o) => ({
              ...o,
              description: o.description ?? null,
              photoUrl: o.photoUrl ?? null,
            }))}
            lineItems={estimate.lineItems}
            discounts={estimate.discounts}
            canDecide={estimate.status !== "APPROVED" && estimate.status !== "CONVERTED"}
            onApprove={approve}
            onDecline={decline}
            decidingId={decidingId}
          />
        )}
      </div>
    </div>
  );
}
