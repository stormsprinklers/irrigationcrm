"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PriceBookItemDTO } from "@/lib/price-book/types";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  onSelect: (item: PriceBookItemDTO) => void;
  categoryId?: string;
};

function formatCurrency(value: string | number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number(value)
  );
}

export function ItemPicker({ open, onClose, onSelect, categoryId }: Props) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<PriceBookItemDTO[]>([]);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (categoryId) params.set("categoryId", categoryId);
      const res = await fetch(`/api/price-book/items?${params.toString()}`);
      if (res.ok) setItems(await res.json());
    } finally {
      setLoading(false);
    }
  }, [categoryId]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => search(query), 200);
    return () => clearTimeout(timer);
  }, [open, query, search]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setItems([]);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg border bg-background shadow-lg">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-semibold">Add from price book</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="border-b px-4 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search services and materials..."
              className="pl-9"
            />
          </div>
        </div>

        <div className="min-h-[240px] overflow-y-auto p-2">
          {loading ? (
            <p className="p-4 text-center text-sm text-muted-foreground">Searching...</p>
          ) : items.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">No items found</p>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelect(item);
                  onClose();
                }}
                className={cn(
                  "flex w-full items-start justify-between gap-3 rounded-md px-3 py-2 text-left hover:bg-muted"
                )}
              >
                <div>
                  <p className="font-medium">{item.name}</p>
                  {item.category ? (
                    <p className="text-xs text-muted-foreground">{item.category.name}</p>
                  ) : null}
                  {item.description ? (
                    <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                      {item.description}
                    </p>
                  ) : null}
                </div>
                <span className="shrink-0 text-sm font-medium">{formatCurrency(item.unitPrice)}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
