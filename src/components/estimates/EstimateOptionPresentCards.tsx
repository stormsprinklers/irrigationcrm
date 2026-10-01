"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Hammer,
  Leaf,
  Lightbulb,
  Package,
  ShieldCheck,
  TreePine,
  Warehouse,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { customerFacingEstimateLines } from "@/lib/estimates/customer-facing-lines";
import { cn } from "@/lib/utils";

export type PresentOption = {
  id: string;
  letter?: string | null;
  label: string;
  description: string | null;
  photoUrl: string | null;
  total: number;
  subtotal?: number;
  discountTotal?: number;
  tax?: number;
  declinedAt?: string | null;
  sortOrder?: number;
  popular?: boolean;
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

function splitPresentCopy(description: string | null) {
  const text = description?.trim() ?? "";
  if (!text) return { tagline: null as string | null, detail: "" };
  const i = text.indexOf("\n\n");
  if (i === -1) return { tagline: null as string | null, detail: text };
  const tagline = text.slice(0, i).trim();
  const detail = text.slice(i + 2).trim();
  if (!tagline || !detail) return { tagline: null as string | null, detail: text };
  return { tagline, detail };
}

function customerFacingOptionDescription(description: string | null) {
  if (!description || !/roofline lighting/i.test(description)) return description;
  return description
    .replace(/\b\d+(?:\.\d+)?\s*(?:ft|feet|foot)\s+of\s+/gi, "")
    .replace(/\b\d+(?:\.\d+)?\s*(?:ft|feet|foot)\b/gi, "");
}

function isHolidayPackageLabel(label: string) {
  return /^(Lights \+ Labor|New Option|Buy Lights|Lease Lights|Permanent Lights|Labor Only)$/i.test(label.trim());
}

export function isMostPopularPresentOption(option: {
  popular?: boolean;
  label: string;
  letter?: string | null;
}) {
  if (option.popular) return true;
  return option.label.trim() === "Lease Lights";
}

export function presentCardsOrder(
  options: Array<{ popular?: boolean; label: string }>
): "price" | "saved" {
  if (options.some((option) => option.popular || isHolidayPackageLabel(option.label))) {
    return "saved";
  }
  return "price";
}

export function rankPresentOptions<
  T extends {
    id: string;
    total: number;
    declinedAt?: string | null;
    sortOrder?: number;
    popular?: boolean;
    label?: string;
  },
>(options: T[], order: "price" | "saved" = "price") {
  const active = [...options].filter((option) => !option.declinedAt);
  if (order === "saved") {
    return active.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || 0);
  }
  return active.sort((a, b) => b.total - a.total || 0);
}

export function defaultPresentOptionId<
  T extends {
    id: string;
    total: number;
    declinedAt?: string | null;
    sortOrder?: number;
    popular?: boolean;
    label: string;
    letter?: string | null;
  },
>(options: T[]) {
  const order = presentCardsOrder(options);
  const ranked = rankPresentOptions(options, order);
  return (
    ranked.find((option) => isMostPopularPresentOption(option))?.id ?? ranked[0]?.id ?? null
  );
}

function optionLineItems(optionId: string, lineItems: PresentLineItem[]) {
  return customerFacingEstimateLines(
    lineItems.filter((item) => !item.optionId || item.optionId === optionId)
  );
}

function optionDiscounts(optionId: string, discounts: PresentDiscount[]) {
  return discounts.filter((discount) => !discount.optionId || discount.optionId === optionId);
}

function lineItemIcon(name: string): LucideIcon {
  const normalized = name.toLowerCase();
  if (normalized.includes("storage")) return Warehouse;
  if (normalized.includes("maintenance")) return Wrench;
  if (normalized.includes("warranty")) return ShieldCheck;
  if (normalized.includes("tree")) return TreePine;
  if (normalized.includes("bush")) return Leaf;
  if (normalized.includes("labor") || normalized.includes("install")) return Hammer;
  if (normalized.includes("parts") || normalized.includes("materials")) return Package;
  return Lightbulb;
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
  const order = useMemo(() => presentCardsOrder(options), [options]);
  const ranked = useMemo(() => rankPresentOptions(options, order), [options, order]);
  const [start, setStart] = useState(0);
  const [internalSelected, setInternalSelected] = useState<string | null>(
    defaultPresentOptionId(options)
  );
  const pageSize = 3;
  const visible = ranked.slice(start, start + pageSize);
  const selected = selectedId ?? internalSelected ?? ranked[0]?.id ?? null;
  const selectedOption = ranked.find((option) => option.id === selected) ?? ranked[0] ?? null;
  const clampLines = useMemo(() => {
    const lines = ranked.map((option) => {
      const { tagline, detail } = splitPresentCopy(customerFacingOptionDescription(option.description));
      return approxDescriptionLines(tagline ? tagline : detail);
    });
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
  const selectedDescription = customerFacingOptionDescription(selectedOption?.description)?.trim() ?? "";
  const selectedCopy = splitPresentCopy(selectedDescription);
  const showFullDescription = selectedCopy.tagline
    ? Boolean(selectedCopy.detail)
    : Boolean(selectedCopy.detail) && approxDescriptionLines(selectedCopy.detail) > clampLines;
  const hideDuplicateLineItems =
    Boolean(selectedCopy.tagline) &&
    selectedItems.length === 1 &&
    selectedItems[0]?.name === selectedOption?.label;

  return (
    <div className="space-y-4">
      <div
        className={cn(
          "overflow-x-auto px-2 py-4",
          "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        )}
      >
        <div className="flex items-stretch gap-4">
          {visible.map((option) => {
            const isSelected = option.id === selected;
            const popular = isMostPopularPresentOption(option);
            const { tagline, detail } = splitPresentCopy(customerFacingOptionDescription(option.description));
            const cardCopy = tagline ?? detail;
            const cardDescription = tagline ? detail : cardCopy;
            const hasMore = approxDescriptionLines(cardDescription) > 2;
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
                  "relative flex min-w-[240px] max-w-sm flex-1 cursor-pointer flex-col overflow-hidden rounded-xl border bg-white text-left shadow-sm outline-none transition-all duration-200",
                  isSelected
                    ? "border-[#4C9BC8] ring-4 ring-[#4C9BC8]/30 shadow-[0_0_28px_rgba(76,155,200,0.65)]"
                    : popular
                      ? "border-amber-400 hover:border-amber-500"
                      : "border-border hover:border-[#4C9BC8]/50"
                )}
              >
                {popular ? (
                  <div className="px-4 pt-3">
                    <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                      Most popular
                    </span>
                  </div>
                ) : null}
                <div className="flex items-start justify-between gap-3 px-4 pt-3">
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
                  <p className="shrink-0 text-lg font-semibold">{formatCurrency(option.total)}</p>
                </div>
                {tagline ? (
                  <p className="px-4 pt-1 text-sm font-medium text-foreground">{tagline}</p>
                ) : null}
                <div className="relative mt-3 h-40 w-full overflow-hidden bg-muted">
                  {option.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={option.photoUrl}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover"
                      onError={(event) => {
                        event.currentTarget.style.display = "none";
                      }}
                    />
                  ) : null}
                </div>
                <div className="flex flex-1 flex-col px-4 py-3">
                  {cardDescription ? (
                    <p
                      className="overflow-hidden whitespace-pre-wrap text-sm text-muted-foreground"
                      style={{
                        display: "-webkit-box",
                        WebkitBoxOrient: "vertical",
                        WebkitLineClamp: 2,
                      }}
                    >
                      {cardDescription}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">&nbsp;</p>
                  )}
                  {hasMore ? (
                    <span className="inline-flex items-center gap-0.5 text-sm font-medium text-[#4C9BC8]">
                      {isSelected ? "Details below" : "More"}
                      <ChevronDown className="h-4 w-4" />
                    </span>
                  ) : null}
                </div>
                <div className="mt-auto flex items-center justify-end gap-2 px-4 pb-4">
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
            <div className="space-y-2">
              {selectedCopy.tagline ? (
                <p className="text-sm font-medium">{selectedCopy.tagline}</p>
              ) : null}
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{selectedCopy.detail}</p>
            </div>
          ) : null}
          {hideDuplicateLineItems ? null : selectedItems.length ? (
            <ul className="space-y-3">
              {selectedItems.map((item, index) => (
                (() => {
                  const Icon = lineItemIcon(item.name);
                  const isDisclaimer = item.name === "Customer-supplied materials";
                  const isIncluded = item.unit?.trim().toLowerCase() === "included";
                  return (
                    <li
                      key={`${item.name}-${index}`}
                      className={cn(
                        "flex justify-between gap-3",
                        isDisclaimer && "border-t pt-3 text-muted-foreground"
                      )}
                    >
                      <div className="flex min-w-0 gap-3">
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#4C9BC8]/12 text-[#4C9BC8]">
                          <Icon className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <span>
                          <span className={cn("block text-base font-semibold leading-tight", isDisclaimer && "text-sm font-medium")}>
                            {isDisclaimer ? "Customer-supplied materials disclaimer" : item.name}
                          </span>
                          {item.description ? (
                            <span className="mt-1 block whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                              {item.description}
                            </span>
                          ) : null}
                        </span>
                      </div>
                      {isDisclaimer ? null : isIncluded ? (
                        <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-[#4C9BC8]">
                          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                          INCLUDED
                        </span>
                      ) : (
                        <span className="shrink-0 text-base font-semibold">{formatCurrency(item.total)}</span>
                      )}
                    </li>
                  );
                })()
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
