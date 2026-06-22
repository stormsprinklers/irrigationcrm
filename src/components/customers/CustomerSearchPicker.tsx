"use client";

import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { CustomerDTO } from "@/lib/customers/types";

type Props = {
  value: string;
  selectedName?: string;
  onValueChange: (customerId: string, customerName: string) => void;
  minQueryLength?: number;
  placeholder?: string;
};

export function CustomerSearchPicker({
  value,
  selectedName,
  onValueChange,
  minQueryLength = 2,
  placeholder = "Search customers by name, phone, email…",
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [displayName, setDisplayName] = useState(selectedName ?? "");

  useEffect(() => {
    if (selectedName) setDisplayName(selectedName);
  }, [selectedName]);

  const searchCustomers = useCallback(async (searchQuery: string) => {
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
  }, [minQueryLength]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void searchCustomers(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, searchCustomers]);

  function selectCustomer(customer: CustomerDTO) {
    onValueChange(customer.id, customer.name);
    setDisplayName(customer.name);
    setQuery("");
    setResults([]);
  }

  function clearSelection() {
    onValueChange("", "");
    setDisplayName("");
    setQuery("");
    setResults([]);
  }

  return (
    <div className="space-y-2">
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
                  className={cn(
                    "flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-muted/50",
                    value === customer.id && "bg-highlight-panel"
                  )}
                >
                  <span className="font-medium">{customer.name}</span>
                  {(customer.phone || customer.email) && (
                    <span className="text-xs text-muted-foreground">
                      {[customer.phone, customer.email].filter(Boolean).join(" · ")}
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
