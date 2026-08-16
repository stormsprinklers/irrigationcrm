"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export type PresentOption = {
  id: string;
  label: string;
  description: string | null;
  photoUrl: string | null;
  total: number;
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

export function EstimateOptionPresentCards({
  options,
  lineItems,
  discounts,
  canDecide,
  onApprove,
  onDecline,
  decidingId,
}: {
  options: PresentOption[];
  lineItems: PresentLineItem[];
  discounts: PresentDiscount[];
  canDecide?: boolean;
  onApprove?: (optionId: string) => void;
  onDecline?: (optionId: string) => void;
  decidingId?: string | null;
}) {
  const ranked = useMemo(
    () =>
      [...options]
        .filter((option) => !option.declinedAt)
        .sort((a, b) => b.total - a.total),
    [options]
  );
  const [start, setStart] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const pageSize = 3;
  const visible = ranked.slice(start, start + pageSize);
  const open = ranked.find((option) => option.id === openId) ?? null;

  if (!ranked.length) {
    return <p className="text-sm text-muted-foreground">No options to present.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-4 overflow-x-auto pb-2">
        {visible.map((option) => (
          <article
            key={option.id}
            className="flex min-w-[240px] max-w-sm flex-1 flex-col overflow-hidden rounded-xl border bg-white shadow-sm"
          >
            <div className="flex items-center justify-between px-4 pt-4">
              <h3 className="text-lg font-semibold">{option.label}</h3>
            </div>
            {option.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={option.photoUrl} alt="" className="mt-3 h-40 w-full object-cover" />
            ) : (
              <div className="mt-3 h-40 w-full bg-muted" />
            )}
            <p className="flex-1 whitespace-pre-wrap px-4 py-3 text-sm text-muted-foreground">
              {option.description || " "}
            </p>
            <div className="mt-auto flex items-center justify-between gap-2 px-4 pb-4">
              <p className="font-semibold">{formatCurrency(option.total)} total</p>
              <Button size="sm" onClick={() => setOpenId(option.id)}>
                View option
              </Button>
            </div>
          </article>
        ))}
      </div>
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
          Showing options {start + 1}-{Math.min(start + visible.length, ranked.length)} of {ranked.length}
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

      {open ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold">{open.label}</h3>
                <p className="mt-1 text-lg font-semibold">{formatCurrency(open.total)}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setOpenId(null)}>
                Close
              </Button>
            </div>
            {open.description ? (
              <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{open.description}</p>
            ) : null}
            <ul className="mt-4 space-y-3">
              {lineItems
                .filter((item) => !item.optionId || item.optionId === open.id)
                .map((item, index) => (
                  <li key={`${item.name}-${index}`} className="flex justify-between gap-3 text-sm">
                    <span>
                      {item.name}
                      {item.description ? (
                        <span className="mt-0.5 block text-muted-foreground">{item.description}</span>
                      ) : null}
                    </span>
                    <span className="shrink-0 font-medium">{formatCurrency(item.total)}</span>
                  </li>
                ))}
            </ul>
            {discounts
              .filter((discount) => !discount.optionId || discount.optionId === open.id)
              .map((discount, index) => (
                <p key={`${discount.label}-${index}`} className="mt-2 text-sm text-muted-foreground">
                  {discount.label || "Discount"}{" "}
                  {discount.type === "PERCENT" ? `-${discount.amount}%` : `-${formatCurrency(discount.amount)}`}
                </p>
              ))}
            {canDecide ? (
              <div className="mt-6 flex flex-wrap gap-2">
                <Button onClick={() => onApprove?.(open.id)} disabled={decidingId === open.id}>
                  Approve this option
                </Button>
                <Button
                  variant="outline"
                  onClick={() => onDecline?.(open.id)}
                  disabled={decidingId === open.id}
                >
                  Decline
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
