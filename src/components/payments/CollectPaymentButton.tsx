"use client";

import { useState } from "react";
import { CreditCard } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Props = {
  visitId: string;
  total: number;
  disabled?: boolean;
  paid?: boolean;
};

export function CollectPaymentButton({ visitId, total, disabled, paid }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleCollect() {
    setLoading(true);
    try {
      const res = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Payment checkout failed");
        return;
      }
      if (data.url) {
        window.location.href = data.url;
      }
    } finally {
      setLoading(false);
    }
  }

  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(total);

  return (
    <Button onClick={handleCollect} disabled={disabled || loading || total <= 0}>
      <CreditCard className="h-4 w-4" />
      {loading ? "Redirecting..." : paid ? "Paid" : `Collect ${formatted}`}
    </Button>
  );
}
