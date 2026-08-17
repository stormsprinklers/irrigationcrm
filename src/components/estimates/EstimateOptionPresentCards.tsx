"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PresentOption = {
  id: string;
  label: string;
  description: string | null;
  photoUrl: string | null;
  total: number;
  subtotal?: number;
  discountTotal?: number;
  tax?: number;
  declinedAt?: string | null;
};

export type PresentLineItem = {
  optionId?: string | null;
  name: string;
  description: string | null;
  quantity: number;
  unitPrice: number;
  unit?: string;
  total: number;
  itemType?: string;
};

export type PresentDiscount = {
  optionId?: string | null;
  label: string | null;
  type: string;
  amount: number;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function approxDescriptionLines(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return 1;
  return trimmed.split(/\n+/).reduce((count, paragraph) => {
    return count + Math.max(1, Math.ceil(paragraph.length / 48));
  }, 0);
}

export function rankPresentOptions<T extends { total: number; declinedAt?: string | null }>(
  options: T[]
) {
  return [...options]
    .filter((option) => !option.declinedAt)
    .sort((a, b) => b.total - a.total || 0);
}

function optionLineItems(optionId: string, lineItems: PresentLineItem[]) {
  return lineItems.filter((item) => !item.optionId || item.optionId === optionId);
}

function optionDiscounts(optionId: string, discounts: PresentDiscount[]) {
  return discounts.filter((discount) => !discount.optionId || discount.optionId === optionId);
}

function discountAmount(subtotal: number, discount: PresentDiscount) {
  if (discount.type.toUpperCase() === "PERCENT") {
    return (subtotal * discount.amount) / 100;
  }
  return discount.amount;
}

function optionTotals(
  option: PresentOption,
  items: PresentLineItem[],
  discounts: PresentDiscount[]
) {
  const computedSubtotal = items.reduce((sum, item) => sum + item.total, 0);
  const subtotal = option.subtotal && option.subtotal > 0 ? option.subtotal : computedSubtotal;
  const computedDiscount = discounts.reduce(
    (sum, discount) => sum + discountAmount(subtotal, discount),
    0
  );
  const discountTotal =
    option.discountTotal && option.discountTotal > 0 ? option.discountTotal : computedDiscount;
  const tax = option.tax && option.tax > 0 ? option.tax : 0;
  const total = option.total > 0 ? option.total : Math.max(0, subtotal - discountTotal + tax);
  return { subtotal, discountTotal, tax, total, discounts };
}

export function EstimateOptionPresentCards({
  options,
  lineItems,
  discounts,
  canDecide,
  canRename,
  selectedId,
  onSelect,
  onApprove,
  onDecline,
  onRename,
  decidingId,
}: {
  options: PresentOption[];
  lineItems: PresentLineItem[];
  discounts: PresentDiscount[];
  canDecide?: boolean;
  canRename?: boolean;
  selectedId?: string | null;
  onSelect?: (optionId: string) => void;
  onApprove?: (optionId: string) => void;
  onDecline?: (optionId: string) => void;
  onRename?: (optionId: string, label: string) => void;
  decidingId?: string | null;
}) {
  const ranked = useMemo(() => rankPresentOptions(options), [options]);
  const [start, setStart] = useState(0);
  const [internalSelected, setInternalSelected] = useState<string | null>(ranked[0]?.id ?? null);
  const pageSize = 3;
  const visible = ranked.slice(start, start + pageSize);
  const selected = selectedId ?? internalSelected ?? ranked[0]?.id ?? null;
  const selectedOption = ranked.find((option) => option.id === selected) ?? ranked[0] ?? null;
  const clampLines = useMemo(() => {
    const lines = ranked.map((option) => approxDescriptionLines(option.description ?? ""));
    if (!lines.length) return 2;
    return Math.max(1, Math.min(...lines));
  }, [ranked]);

  function select(optionId: string) {
    setInternalSelected(optionId);
    onSelect?.(optionId);
  }

  if (!ranked.length) {
    return <p className="text-sm text-muted-foreground">No options to present.</p>;
  }

  const selectedItems = selectedOption ? optionLineItems(selectedOption.id, lineItems) : [];
  const selectedDiscountRows = selectedOption
    ? optionDiscounts(selectedOption.id, discounts)
    : [];
  const totals = selectedOption
    ? optionTotals(selectedOption, selectedItems, selectedDiscountRows)
    : null;
  const selectedDescription = selectedOption?.description?.trim() ?? "";
  const showFullDescription =
    Boolean(selectedDescription) && approxDescriptionLines(selectedDescription) > clampLines;

  return (
    <div className="space-y-4">
      <div
        className={cn(
          "overflow-x-auto pb-1",
          "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        )}
      >
        <div className="flex items-stretch gap-4">
          {visible.map((option) => {
            const isSelected = option.id === selected;
            return (
              <article
                key={option.id}
                role="button"
                tabIndex={0}
                onClick={() => select(option.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    select(option.id);
                  }
                }}
                className={cn(
                  "flex min-w-[240px] max-w-sm flex-1 cursor-pointer flex-col overflow-hidden rounded-xl border bg-white text-left shadow-sm outline-none transition-shadow",
                  isSelected
                    ? "border-[#4C9BC8] ring-2 ring-[#4C9BC8]"
                    : "border-border hover:border-[#4C9BC8]/50"
                )}
              >
                <div className="flex items-center justify-between gap-2 px-4 pt-4">
                  {canRename ? (
                    <input
                      className="w-full bg-transparent text-lg font-semibold outline-none"
                      defaultValue={option.label}
                      aria-label="Option name"
                      onClick={(e) => e.stopPropagation()}
                      onBlur={(e) => {
                        const label = e.target.value.trim();
                        if (label && label !== option.label) onRename?.(option.id, label);
                      }}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                    />
                  ) : (
                    <h3 className="text-lg font-semibold">{option.label}</h3>
                  )}
                </div>
                {option.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={option.photoUrl} alt="" className="mt-3 h-40 w-full object-cover" />
                ) : (
                  <div className="mt-3 h-40 w-full bg-muted" />
                )}
                <div className="flex flex-1 flex-col px-4 py-3">
                  {option.description ? (
                    <p
                      className="overflow-hidden whitespace-pre-wrap text-sm text-muted-foreground"
                      style={{
                        display: "-webkit-box",
                        WebkitBoxOrient: "vertical",
                        WebkitLineClamp: clampLines,
                      }}
                    >
                      {option.description}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">&nbsp;</p>
                  )}
                  {option.description && approxDescriptionLines(option.description) > clampLines ? (
                    <span className="mt-1 inline-flex items-center gap-0.5 text-sm font-medium text-[#4C9BC8]">
                      … More
                      <ChevronDown className="h-4 w-4" />
                    </span>
                  ) : null}
                </div>
                <div className="mt-auto flex items-center justify-between gap-2 px-4 pb-4">
                  <p className="font-semibold">{formatCurrency(option.total)} total</p>
                  <span className="text-sm font-medium text-[#4C9BC8]">
                    {isSelected ? "Selected" : "View option"}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {selectedOption && totals ? (
        <div className="space-y-3 rounded-xl border bg-white px-4 py-4 shadow-sm">
          {showFullDescription ? (
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{selectedDescription}</p>
          ) : null}
          {selectedItems.length ? (
            <ul className="space-y-3">
              {selectedItems.map((item, index) => (
                <li key={`${item.name}-${index}`} className="flex justify-between gap-3 text-sm">
                  <span>
                    <span className="font-medium">{item.name}</span>
                    {item.description ? (
                      <span className="mt-0.5 block whitespace-pre-wrap text-muted-foreground">
                        {item.description}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 font-medium">{formatCurrency(item.total)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No line items on this option.</p>
          )}
          <div className="space-y-1 border-t pt-3 text-sm">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatCurrency(totals.subtotal)}</span>
            </div>
            {totals.discounts.map((discount, index) => {
              const amount = discountAmount(totals.subtotal, discount);
              if (amount <= 0) return null;
              const percent =
                discount.type.toUpperCase() === "PERCENT" ? ` (${discount.amount}%)` : "";
              return (
                <div
                  key={`${discount.label}-${index}`}
                  className="flex justify-between text-muted-foreground"
                >
                  <span>
                    {discount.label || "Discount"}
                    {percent}
                  </span>
                  <span>−{formatCurrency(amount)}</span>
                </div>
              );
            })}
            {totals.discountTotal > 0 && totals.discounts.length === 0 ? (
              <div className="flex justify-between text-muted-foreground">
                <span>Discounts</span>
                <span>−{formatCurrency(totals.discountTotal)}</span>
              </div>
            ) : null}
            {totals.tax > 0 ? (
              <div className="flex justify-between">
                <span>Tax</span>
                <span>{formatCurrency(totals.tax)}</span>
              </div>
            ) : null}
            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span>{formatCurrency(totals.total)}</span>
            </div>
          </div>
          {canDecide ? (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                onClick={() => onApprove?.(selectedOption.id)}
                disabled={decidingId === selectedOption.id}
              >
                Approve this option
              </Button>
              <Button
                variant="outline"
                onClick={() => onDecline?.(selectedOption.id)}
                disabled={decidingId === selectedOption.id}
              >
                Decline
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {ranked.length > pageSize ? (
        <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
          <button
            type="button"
            className="rounded-full p-2 hover:bg-muted disabled:opacity-40"
            disabled={start === 0}
            onClick={() => setStart((value) => Math.max(0, value - 1))}
            aria-label="Previous options"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span>
            Showing options {start + 1}-{Math.min(start + visible.length, ranked.length)} of{" "}
            {ranked.length}
          </span>
          <button
            type="button"
            className="rounded-full p-2 hover:bg-muted disabled:opacity-40"
            disabled={start + pageSize >= ranked.length}
            onClick={() => setStart((value) => Math.min(ranked.length - 1, value + 1))}
            aria-label="Next options"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
