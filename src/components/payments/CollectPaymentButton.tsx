"use client";

import { useState } from "react";
import { ChevronDown, CreditCard, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Props = {
  visitId: string;
  total: number;
  /** Optional partial amount (e.g. deposit). Defaults to `total`. */
  amount?: number;
  disabled?: boolean;
  paid?: boolean;
  allowInvoice?: boolean;
  onInvoiceSent?: () => void;
};

export function CollectPaymentButton({
  visitId,
  total,
  amount,
  disabled,
  paid,
  allowInvoice = false,
  onInvoiceSent,
}: Props) {
  const [loading, setLoading] = useState(false);
  const collectAmount = amount != null && amount > 0 ? amount : total;

  async function handleCollect() {
    setLoading(true);
    try {
      const res = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitId, amount: collectAmount }),
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

  async function handleSendInvoice() {
    setLoading(true);
    try {
      const res = await fetch(`/api/visits/${visitId}/invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ send: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
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

      const channel =
        data.emailSent && data.smsSent
          ? " by email and SMS"
          : data.emailSent
            ? " by email"
            : data.smsSent
              ? " by SMS"
              : "";
      toast.success(`Invoice sent${channel}`);
      onInvoiceSent?.();
    } catch {
      toast.error("Invoice could not be sent. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(collectAmount);

  if (!allowInvoice) {
    return (
      <Button onClick={handleCollect} disabled={disabled || loading || collectAmount <= 0}>
        <CreditCard className="h-4 w-4" />
        {loading ? "Redirecting..." : paid ? "Paid" : `Collect ${formatted}`}
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button disabled={disabled || loading || collectAmount <= 0}>
          <CreditCard className="h-4 w-4" />
          {loading ? "Working..." : paid ? "Paid" : "Pay now"}
          {!paid ? <ChevronDown className="h-4 w-4" /> : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuItem onClick={() => void handleCollect()}>
          <CreditCard className="h-4 w-4" />
          Take payment now · {formatted}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void handleSendInvoice()}>
          <Send className="h-4 w-4" />
          Send invoice to customer
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
