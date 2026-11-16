"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ItemPicker } from "@/components/price-book/ItemPicker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { PriceBookItemDTO } from "@/lib/price-book/types";
import { sumDiscounts } from "@/lib/visits/totals";
import { isIncludedVisitLineItem } from "@/lib/visits/included-line-items";

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

type LineItemDraft = {
  name: string;
  description: string;
  quantity: string;
  unitPrice: string;
};

const EMPTY_LINE_ITEM: LineItemDraft = {
  name: "",
  description: "",
  quantity: "1",
  unitPrice: "0",
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
  const [editor, setEditor] = useState<{ lineItemId: string | null; draft: LineItemDraft } | null>(null);
  const [discountLabel, setDiscountLabel] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");
  const [discountType, setDiscountType] = useState<"PERCENT" | "FIXED">("FIXED");
  const [discountSaving, setDiscountSaving] = useState(false);
  const [includedItemsOpen, setIncludedItemsOpen] = useState(false);

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

  function openCustomItem() {
    setEditor({ lineItemId: null, draft: { ...EMPTY_LINE_ITEM } });
  }

  function openItemEditor(item: LineItem) {
    setEditor({
      lineItemId: item.id,
      draft: {
        name: item.name,
        description: item.description ?? "",
        quantity: String(item.quantity),
        unitPrice: String(item.unitPrice),
      },
    });
  }

  async function saveEditor(event: React.FormEvent) {
    event.preventDefault();
    if (!editor) return;

    const name = editor.draft.name.trim();
    const quantity = Number(editor.draft.quantity);
    const unitPrice = Number(editor.draft.unitPrice);
    if (!name) {
      toast.error("Item name is required");
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast.error("Quantity must be greater than zero");
      return;
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      toast.error("Unit price cannot be negative");
      return;
    }

    setSaving(true);
    try {
      const editing = Boolean(editor.lineItemId);
      const res = await fetch(`/api/visits/${visitId}/line-items`, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editor.lineItemId ? { lineItemId: editor.lineItemId } : {}),
          name,
          description: editor.draft.description.trim() || null,
          quantity,
          unitPrice,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? `Failed to ${editing ? "update" : "add"} line item`);
        return;
      }
      setEditor(null);
      toast.success(editing ? "Line item updated" : "Custom line item added");
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
  const includedLineItems = lineItems.filter(isIncludedVisitLineItem);
  const primaryLineItems = lineItems.filter((item) => !isIncludedVisitLineItem(item));

  function lineItemRow(item: LineItem) {
    return (
      <div
        key={item.id}
        className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_80px_100px_auto]"
      >
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
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Edit ${item.name}`}
            onClick={() => openItemEditor(item)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => removeItem(item.id)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base">Line items</CardTitle>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)} disabled={saving}>
              Price book
            </Button>
            <Button type="button" size="sm" onClick={openCustomItem} disabled={saving}>
              <Plus className="h-4 w-4" />
              Custom item
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {lineItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">No line items yet.</p>
          ) : (
            <>
              {primaryLineItems.map(lineItemRow)}
              {includedLineItems.length ? (
                <div className="overflow-hidden rounded-md border border-dashed bg-muted/20">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left text-sm font-medium hover:bg-muted/40"
                    aria-expanded={includedItemsOpen}
                    onClick={() => setIncludedItemsOpen((open) => !open)}
                  >
                    <span>Included items ({includedLineItems.length})</span>
                    {includedItemsOpen ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                  {includedItemsOpen ? (
                    <div className="space-y-2 border-t p-3">
                      {includedLineItems.map(lineItemRow)}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
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

      {editor ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close line item editor"
            onClick={() => setEditor(null)}
            disabled={saving}
          />
          <form
            onSubmit={(event) => void saveEditor(event)}
            className="relative z-10 w-full max-w-lg rounded-lg border bg-background p-5 shadow-lg"
          >
            <h2 className="text-lg font-semibold">
              {editor.lineItemId ? "Edit line item" : "Add custom line item"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Changes apply to this visit only and do not modify the price book.
            </p>
            <div className="mt-4 space-y-3">
              <label className="block text-sm font-medium">
                Item name
                <Input
                  className="mt-1"
                  autoFocus
                  value={editor.draft.name}
                  onChange={(event) => setEditor({
                    ...editor,
                    draft: { ...editor.draft, name: event.target.value },
                  })}
                  placeholder="Service or material"
                  required
                />
              </label>
              <label className="block text-sm font-medium">
                Description (optional)
                <textarea
                  className="mt-1 min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={editor.draft.description}
                  onChange={(event) => setEditor({
                    ...editor,
                    draft: { ...editor.draft, description: event.target.value },
                  })}
                  placeholder="Details shown on the visit and invoice"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-medium">
                  Quantity
                  <Input
                    className="mt-1"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={editor.draft.quantity}
                    onChange={(event) => setEditor({
                      ...editor,
                      draft: { ...editor.draft, quantity: event.target.value },
                    })}
                    required
                  />
                </label>
                <label className="block text-sm font-medium">
                  Unit price
                  <Input
                    className="mt-1"
                    type="number"
                    min="0"
                    step="0.01"
                    value={editor.draft.unitPrice}
                    onChange={(event) => setEditor({
                      ...editor,
                      draft: { ...editor.draft, unitPrice: event.target.value },
                    })}
                    required
                  />
                </label>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditor(null)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : editor.lineItemId ? "Save changes" : "Add item"}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
