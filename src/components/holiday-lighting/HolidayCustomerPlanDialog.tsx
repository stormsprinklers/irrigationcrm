"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import { HolidayStrandMapViewer } from "@/components/holiday-lighting/HolidayStrandMapViewer";
import { Button } from "@/components/ui/button";
import type {
  HolidayCustomerPlan,
  HolidayStrandMap,
} from "@/lib/holiday-lighting/strand-map";

type Props = {
  open: boolean;
  onClose: () => void;
  plan: HolidayCustomerPlan;
  estimateToken: string;
  previewToken?: string;
};

export function HolidayCustomerPlanDialog({
  open,
  onClose,
  plan,
  estimateToken,
  previewToken,
}: Props) {
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");

  const viewerMap = useMemo<HolidayStrandMap>(
    () => ({
      version: 1,
      address: plan.address,
      center: plan.center,
      marginPct: 0,
      features: plan.features.map((feature) => ({
        ...feature,
        lengthFt: 0,
        lengthFtWithMargin: 0,
        lightStyleKey: "",
        lightStyleLabel: "",
        purchaseTotal: 0,
        leaseTotal: 0,
      })),
    }),
    [plan]
  );

  useEffect(() => {
    if (!open) return;
    setError("");
    const query = previewToken
      ? `?previewToken=${encodeURIComponent(previewToken)}`
      : "";
    const controller = new AbortController();
    fetch(`/api/portal/estimates/${estimateToken}/maps-key${query}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok || typeof data.key !== "string") {
          throw new Error(data.error ?? "Satellite plan is unavailable");
        }
        setApiKey(data.key);
      })
      .catch((fetchError) => {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") return;
        setError(fetchError instanceof Error ? fetchError.message : "Satellite plan is unavailable");
      });
    return () => controller.abort();
  }, [estimateToken, open, previewToken]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="holiday-plan-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        aria-label="Close plans"
        onClick={onClose}
      />
      <div className="relative z-10 max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-xl border border-border bg-white p-5 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="holiday-plan-title" className="text-xl font-semibold">
              Project plan
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Satellite view of the proposed holiday lighting scope.
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close plans">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="my-4 rounded-lg border border-primary/20 bg-primary/5 p-4 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Total estimated footage
          </p>
          <p className="mt-1 text-3xl font-semibold">
            {plan.totalEstimatedFeet.toFixed(1)} ft
          </p>
        </div>

        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {error}
          </div>
        ) : apiKey ? (
          <HolidayStrandMapViewer
            map={viewerMap}
            mode="customer"
            apiKey={apiKey}
            showLegend={false}
          />
        ) : (
          <div className="flex h-72 items-center justify-center gap-2 rounded-lg border bg-muted text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading satellite plan…
          </div>
        )}
      </div>
    </div>
  );
}
