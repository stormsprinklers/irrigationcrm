"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PartsSupplierRecord, PlaceSearchResult } from "@/lib/parts-suppliers/types";

export function PartsSuppliersManager() {
  const [suppliers, setSuppliers] = useState<PartsSupplierRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [addingId, setAddingId] = useState<string | null>(null);

  const configuredPlaceIds = useMemo(
    () =>
      new Set(
        suppliers.map((supplier) => supplier.googlePlaceId).filter((id): id is string => Boolean(id))
      ),
    [suppliers]
  );

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    try {
      const res = await fetch("/api/settings/parts-suppliers");
      if (res.ok) setSuppliers(await res.json());
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function runSearch() {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await fetch("/api/settings/parts-suppliers/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Search failed");
        return;
      }
      setResults(data.results ?? []);
      if (!data.results?.length) toast.message("No businesses found");
    } finally {
      setSearching(false);
    }
  }

  async function addSupplier(googlePlaceId: string) {
    if (configuredPlaceIds.has(googlePlaceId)) return;

    setAddingId(googlePlaceId);
    try {
      const res = await fetch("/api/settings/parts-suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ googlePlaceId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to add supplier");
        return;
      }
      toast.success(`Added ${data.name}`);
      await load({ silent: true });
    } finally {
      setAddingId(null);
    }
  }

  async function toggleActive(supplier: PartsSupplierRecord) {
    const res = await fetch(`/api/settings/parts-suppliers/${supplier.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !supplier.isActive }),
    });
    if (!res.ok) {
      toast.error("Failed to update supplier");
      return;
    }
    await load({ silent: true });
  }

  async function removeSupplier(id: string) {
    if (!confirm("Remove this parts supplier?")) return;
    const res = await fetch(`/api/settings/parts-suppliers/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to remove supplier");
      return;
    }
    await load({ silent: true });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-white p-4">
        <h2 className="text-sm font-semibold">Add supplier</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Search by business name and city, or paste a Google Maps link. Hours and phone are pulled
          automatically from Google when you add a supplier.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='e.g. "Ewing Irrigation Lehi UT"'
            className="max-w-md"
            onKeyDown={(e) => {
              if (e.key === "Enter") void runSearch();
            }}
          />
          <Button type="button" onClick={() => void runSearch()} disabled={searching}>
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Search Google
          </Button>
        </div>

        {results.length > 0 ? (
          <ul className="mt-4 divide-y rounded-md border">
            {results.map((result) => {
              const isAdded = configuredPlaceIds.has(result.googlePlaceId);
              const isAdding = addingId === result.googlePlaceId;

              return (
                <li key={result.googlePlaceId} className="flex items-start justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="font-medium">{result.name}</p>
                    <p className="text-sm text-muted-foreground">{result.formattedAddress}</p>
                    {result.phone ? (
                      <p className="text-sm text-muted-foreground">{result.phone}</p>
                    ) : null}
                    {result.weekdayHours[0] ? (
                      <p className="text-xs text-muted-foreground">{result.weekdayHours[0]}</p>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant={isAdded ? "outline" : "default"}
                    className={
                      isAdded
                        ? "border-primary bg-background text-primary hover:bg-background hover:text-primary"
                        : undefined
                    }
                    onClick={() => void addSupplier(result.googlePlaceId)}
                    disabled={isAdded || isAdding}
                  >
                    {isAdding ? "Adding..." : isAdded ? "Added" : "Add"}
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>

      <section className="rounded-lg border bg-white">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Configured suppliers</h2>
        </div>
        {loading ? (
          <p className="p-4 text-sm text-muted-foreground">Loading...</p>
        ) : suppliers.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No suppliers configured yet.</p>
        ) : (
          <ul className="divide-y">
            {suppliers.map((supplier) => (
              <li key={supplier.id} className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{supplier.name}</p>
                    {!supplier.isActive ? (
                      <span className="rounded bg-muted px-2 py-0.5 text-xs">Inactive</span>
                    ) : null}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {[supplier.address, supplier.city, supplier.state, supplier.zip]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                  {supplier.phone ? (
                    <p className="text-sm text-muted-foreground">{supplier.phone}</p>
                  ) : null}
                  {supplier.weekdayHours.length > 0 ? (
                    <ul className="mt-1 text-xs text-muted-foreground">
                      {supplier.weekdayHours.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">No hours on file from Google</p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void toggleActive(supplier)}
                  >
                    {supplier.isActive ? "Deactivate" : "Activate"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => void removeSupplier(supplier.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
