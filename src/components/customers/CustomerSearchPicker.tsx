"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { CustomerDTO } from "@/lib/customers/types";
import { formatPhoneDisplay } from "@/lib/inbox/phone";
import {
  AddCustomerQuickDialog,
  prefillFromSearchQuery,
} from "@/components/customers/AddCustomerQuickDialog";

type Props = {
  value: string;
  selectedName?: string;
  onValueChange: (customerId: string, customerName: string) => void;
  onCustomerSelect?: (customer: CustomerDTO) => void;
  minQueryLength?: number;
  placeholder?: string;
  /** Single-line control with dropdown results (no always-visible results panel). */
  compact?: boolean;
  className?: string;
};

export function CustomerSearchPicker({
  value,
  selectedName,
  onValueChange,
  onCustomerSelect,
  minQueryLength = 2,
  placeholder = "Search customers by name, phone, email…",
  compact = false,
  className,
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [displayName, setDisplayName] = useState(selectedName ?? "");
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const compactRootRef = useRef<HTMLDivElement>(null);
  const [compactMenuStyle, setCompactMenuStyle] = useState<React.CSSProperties | null>(null);

  useEffect(() => {
    if (selectedName) setDisplayName(selectedName);
  }, [selectedName]);

  useEffect(() => {
    if (!compact || !open) {
      setCompactMenuStyle(null);
      return;
    }

    function updatePosition() {
      const el = compactRootRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const gap = 4;
      const spaceBelow = window.innerHeight - rect.bottom - gap;
      const spaceAbove = rect.top - gap;
      const openUp = spaceBelow < 160 && spaceAbove > spaceBelow;
      setCompactMenuStyle({
        position: "fixed",
        left: rect.left,
        width: Math.max(rect.width, 280),
        zIndex: 300,
        ...(openUp
          ? { bottom: window.innerHeight - rect.top + gap }
          : { top: rect.bottom + gap }),
      });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [compact, open]);

  const searchCustomers = useCallback(
    async (searchQuery: string) => {
      const q = searchQuery.trim();
      if (q.length < minQueryLength) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`/api/customers?search=${encodeURIComponent(q)}&status=ACTIVE`);
        if (!res.ok) {
          setResults([]);
          return;
        }
        const data = await res.json();
        setResults(data.customers ?? []);
      } finally {
        setLoading(false);
      }
    },
    [minQueryLength]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      void searchCustomers(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, searchCustomers]);

  function selectCustomer(customer: CustomerDTO) {
    if (customer.doNotService) return;
    onValueChange(customer.id, customer.name);
    onCustomerSelect?.(customer);
    setDisplayName(customer.name);
    setQuery("");
    setResults([]);
    setOpen(false);
    setCreateOpen(false);
  }

  function openCreate() {
    setOpen(false);
    setCreateOpen(true);
  }

  function clearSelection() {
    onValueChange("", "");
    setDisplayName("");
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  if (compact) {
    const selected = Boolean(value && displayName);
    return (
      <div className={cn("relative min-w-0", className)} ref={compactRootRef}>
        {selected && !open ? (
          <div className="flex h-9 items-center gap-1 rounded-md border border-border bg-muted/40 px-2 text-sm">
            <span className="min-w-0 flex-1 truncate font-medium">{displayName}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setOpen(true)}
            >
              Change
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={clearSelection}
              aria-label="Clear customer"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={placeholder}
              value={query}
              autoFocus={selected}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => {
                // Allow result click before closing.
                window.setTimeout(() => setOpen(false), 150);
              }}
              className="h-9 pl-8"
            />
          </div>
        )}

        {open && !(selected && !open) && compactMenuStyle && typeof document !== "undefined"
          ? createPortal(
              <div
                className="flex flex-col overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md"
                style={compactMenuStyle}
              >
                <ul className="max-h-48 overflow-y-auto">
                  {loading ? (
                    <li className="px-3 py-2 text-sm text-muted-foreground">Searching…</li>
                  ) : query.trim().length < minQueryLength ? (
                    <li className="px-3 py-2 text-sm text-muted-foreground">
                      Type at least {minQueryLength} characters to search, or add a new customer.
                    </li>
                  ) : results.length === 0 ? (
                    <li className="px-3 py-2 text-sm text-muted-foreground">No customers found.</li>
                  ) : (
                    results.map((customer) => (
                      <li key={customer.id}>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => selectCustomer(customer)}
                          disabled={customer.doNotService}
                          className={cn(
                            "flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-muted/50",
                            value === customer.id && "bg-highlight-panel",
                            customer.doNotService && "cursor-not-allowed opacity-50"
                          )}
                        >
                          <span className="font-medium">
                            {customer.name}
                            {customer.doNotService ? " (do not service)" : ""}
                          </span>
                          {(customer.phone || customer.email) && (
                            <span className="text-xs text-muted-foreground">
                              {[customer.phone ? formatPhoneDisplay(customer.phone) : null, customer.email]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          )}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
                <div className="border-t border-border p-1">
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={openCreate}
                    className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm font-medium text-primary hover:bg-muted/50"
                  >
                    <Plus className="h-4 w-4" />
                    Add customer
                  </button>
                </div>
              </div>,
              document.body
            )
          : null}

        <AddCustomerQuickDialog
          open={createOpen}
          prefill={prefillFromSearchQuery(query)}
          onClose={() => setCreateOpen(false)}
          onCreated={selectCustomer}
        />
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {value && displayName ? (
        <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          <span className="font-medium">{displayName}</span>
          <Button type="button" variant="ghost" size="sm" onClick={clearSelection}>
            Clear
          </Button>
        </div>
      ) : null}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      <ScrollArea className="h-40 rounded-md border border-border">
        {loading ? (
          <p className="p-3 text-sm text-muted-foreground">Searching…</p>
        ) : query.trim().length < minQueryLength ? (
          <p className="p-3 text-sm text-muted-foreground">
            Type at least {minQueryLength} characters to search.
          </p>
        ) : results.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">No customers found.</p>
        ) : (
          <ul>
            {results.map((customer) => (
              <li key={customer.id}>
                <button
                  type="button"
                  onClick={() => selectCustomer(customer)}
                  disabled={customer.doNotService}
                  className={cn(
                    "flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-muted/50",
                    value === customer.id && "bg-highlight-panel",
                    customer.doNotService && "cursor-not-allowed opacity-50"
                  )}
                >
                  <span className="font-medium">
                    {customer.name}
                    {customer.doNotService ? " (do not service)" : ""}
                  </span>
                  {(customer.phone || customer.email) && (
                    <span className="text-xs text-muted-foreground">
                      {[customer.phone ? formatPhoneDisplay(customer.phone) : null, customer.email]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
      <Button type="button" variant="outline" size="sm" onClick={openCreate}>
        <Plus className="h-4 w-4" />
        Add customer
      </Button>
      <AddCustomerQuickDialog
        open={createOpen}
        prefill={prefillFromSearchQuery(query)}
        onClose={() => setCreateOpen(false)}
        onCreated={selectCustomer}
      />
    </div>
  );
}
