"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Discount = {
  id: string;
  label: string | null;
  type: "PERCENT" | "FIXED";
  amount: string | number;
};

type Props = {
  visitId: string;
  discounts: Discount[];
  onUpdated: () => Promise<void>;
};

function formatDiscount(discount: Discount) {
  const amount = Number(discount.amount);
  if (discount.type === "PERCENT") return `${amount}%`;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

export function VisitDiscountsSection({ visitId, discounts, onUpdated }: Props) {
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<"PERCENT" | "FIXED">("FIXED");
  const [saving, setSaving] = useState(false);

  async function addDiscount(e: React.FormEvent) {
    e.preventDefault();
    if (!amount) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/visits/${visitId}/discounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label || null, type, amount: Number(amount) }),
      });
      if (!res.ok) {
        toast.error("Failed to add discount");
        return;
      }
      setLabel("");
      setAmount("");
      await onUpdated();
    } finally {
      setSaving(false);
    }
  }

  async function removeDiscount(discountId: string) {
    const res = await fetch(
      `/api/visits/${visitId}/discounts?discountId=${encodeURIComponent(discountId)}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      toast.error("Failed to remove discount");
      return;
    }
    await onUpdated();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Discounts</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={addDiscount} className="grid gap-2 sm:grid-cols-[1fr_100px_120px_auto]">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (optional)"
          />
          <Input
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount"
            required
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value as "PERCENT" | "FIXED")}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="FIXED">Fixed ($)</option>
            <option value="PERCENT">Percent (%)</option>
          </select>
          <Button type="submit" disabled={saving}>
            Add
          </Button>
        </form>

        {discounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No discounts applied.</p>
        ) : (
          <div className="space-y-2">
            {discounts.map((discount) => (
              <div
                key={discount.id}
                className="flex items-center justify-between rounded-md border p-3 text-sm"
              >
                <span>
                  {discount.label ?? "Discount"} — {formatDiscount(discount)}
                </span>
                <Button variant="ghost" size="icon" onClick={() => removeDiscount(discount.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
