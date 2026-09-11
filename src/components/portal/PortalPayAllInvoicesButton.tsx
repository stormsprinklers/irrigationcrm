"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

function money(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export function PortalPayAllInvoicesButton({
  returnPath,
  count,
  total,
  className,
}: {
  returnPath: string;
  count: number;
  total: number;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  if (count < 2) return null;

  async function startCheckout() {
    setBusy(true);
    try {
      const res = await fetch("/api/portal/invoices/pay-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnPath }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || typeof data.url !== "string") {
        throw new Error(typeof data.error === "string" ? data.error : "Could not start checkout");
      }
      window.location.href = data.url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start checkout");
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      className={className ?? "bg-storm-coral hover:bg-storm-coral/90"}
      disabled={busy}
      onClick={() => void startCheckout()}
    >
      {busy ? "Starting checkout…" : `Pay all ${count} invoices (${money(total)})`}
    </Button>
  );
}

export async function confirmPortalInvoiceCheckout(sessionId: string) {
  const res = await fetch("/api/portal/invoices/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 202) {
    throw new Error(typeof data.error === "string" ? data.error : "Unable to confirm payment");
  }
  return data;
}
