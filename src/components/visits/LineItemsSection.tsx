"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ItemPicker } from "@/components/price-book/ItemPicker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { PriceBookItemDTO } from "@/lib/price-book/types";
import { sumDiscounts } from "@/lib/visits/totals";

type LineItem = {
  id: string;
  name: string;
  description: string | null;
  quantity: string | number;
  unitPrice: string | number;
  total: string | number;
};

type Discount = {
  id: string;
  label: string | null;
  type: "PERCENT" | "FIXED";
  amount: string | number;
};

type Props = {
  visitId: string;
  lineItems: LineItem[];
  discounts: Discount[];
  onUpdated: () => Promise<void>;
};

function formatCurrency(value: string | number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number(value)
  );
}

function formatDiscount(discount: Discount) {
  const amount = Number(discount.amount);
  if (discount.type === "PERCENT") return `${amount}%`;
  return formatCurrency(amount);
}

export function LineItemsSection({ visitId, lineItems, discounts, onUpdated }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [discountLabel, setDiscountLabel] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");
  const [discountType, setDiscountType] = useState<"PERCENT" | "FIXED">("FIXED");
  const [discountSaving, setDiscountSaving] = useState(false);

  async function addFromPriceBook(item: PriceBookItemDTO) {
    setSaving(true);
    try {
      const res = await fetch(`/api/visits/${visitId}/line-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          priceBookItemId: item.id,
          name: item.name,
          description: item.description,
          unitPrice: Number(item.unitPrice),
          quantity: 1,
        }),
      });
      if (!res.ok) {
        toast.error("Failed to add line item");
        return;
      }
      await onUpdated();
    } finally {
      setSaving(false);
    }
  }

  async function updateItem(lineItemId: string, quantity: number, unitPrice: number) {
    const res = await fetch(`/api/visits/${visitId}/line-items`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lineItemId, quantity, unitPrice }),
    });
    if (!res.ok) {
      toast.error("Failed to update line item");
      return;
    }
    await onUpdated();
  }

  async function removeItem(lineItemId: string) {
    const res = await fetch(
      `/api/visits/${visitId}/line-items?lineItemId=${encodeURIComponent(lineItemId)}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      toast.error("Failed to remove line item");
      return;
    }
    await onUpdated();
  }

  async function addDiscount(e: React.FormEvent) {
    e.preventDefault();
    if (!discountAmount) return;
    setDiscountSaving(true);
    try {
      const res = await fetch(`/api/visits/${visitId}/discounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: discountLabel || null,
          type: discountType,
          amount: Number(discountAmount),
        }),
      });
      if (!res.ok) {
        toast.error("Failed to add discount");
        return;
      }
      setDiscountLabel("");
      setDiscountAmount("");
      await onUpdated();
    } finally {
      setDiscountSaving(false);
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

  const subtotal = lineItems.reduce((sum, item) => sum + Number(item.total), 0);
  const discountTotal = sumDiscounts(subtotal, discounts);
  const total = Math.max(0, subtotal - discountTotal);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base">Line items</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)} disabled={saving}>
            <Plus className="h-4 w-4" />
            Add item
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {lineItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">No line items yet.</p>
          ) : (
            lineItems.map((item) => (
              <div key={item.id} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_80px_100px_auto]">
                <div>
                  <p className="font-medium">{item.name}</p>
                  {item.description ? (
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  ) : null}
                </div>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={Number(item.quantity)}
                  onBlur={(e) =>
                    updateItem(item.id, Number(e.target.value), Number(item.unitPrice))
                  }
                />
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={Number(item.unitPrice)}
                  onBlur={(e) =>
                    updateItem(item.id, Number(item.quantity), Number(e.target.value))
                  }
                />
                <div className="flex items-center justify-end gap-2">
                  <span className="text-sm font-medium">{formatCurrency(item.total)}</span>
                  <Button variant="ghost" size="icon" onClick={() => removeItem(item.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}

          <div className="space-y-3 border-t pt-4">
            <p className="text-sm font-medium">Discounts</p>
            <form onSubmit={addDiscount} className="grid gap-2 sm:grid-cols-[1fr_100px_120px_auto]">
              <Input
                value={discountLabel}
                onChange={(e) => setDiscountLabel(e.target.value)}
                placeholder="Label (optional)"
              />
              <Input
                type="number"
                min={0}
                step="0.01"
                value={discountAmount}
                onChange={(e) => setDiscountAmount(e.target.value)}
                placeholder="Amount"
                required
              />
              <select
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value as "PERCENT" | "FIXED")}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="FIXED">Fixed ($)</option>
                <option value="PERCENT">Percent (%)</option>
              </select>
              <Button type="submit" disabled={discountSaving}>
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
          </div>

          <div className="space-y-1 border-t pt-3 text-sm">
            <div className="flex justify-end gap-4">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium">{formatCurrency(subtotal)}</span>
            </div>
            {discountTotal > 0 ? (
              <div className="flex justify-end gap-4 text-muted-foreground">
                <span>Discounts</span>
                <span>−{formatCurrency(discountTotal)}</span>
              </div>
            ) : null}
            <div className="flex justify-end gap-4 pt-1 font-semibold">
              <span>Total</span>
              <span>{formatCurrency(total)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <ItemPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={addFromPriceBook}
      />
    </>
  );
}
