"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { CustomerDTO } from "@/lib/customers/types";
import { formatPhoneDisplay } from "@/lib/inbox/phone";

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

  useEffect(() => {
    if (selectedName) setDisplayName(selectedName);
  }, [selectedName]);

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
  }

  function clearSelection() {
    onValueChange("", "");
    setDisplayName("");
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  const showResults =
    open && (loading || query.trim().length >= minQueryLength || results.length > 0);

  if (compact) {
    const selected = Boolean(value && displayName);
    return (
      <div className={cn("relative min-w-0", className)}>
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

        {showResults && !(selected && !open) ? (
          <ul className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-border bg-background shadow-md">
            {loading ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">Searching…</li>
            ) : query.trim().length < minQueryLength ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">
                Type at least {minQueryLength} characters…
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
        ) : null}
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
    </div>
  );
}
