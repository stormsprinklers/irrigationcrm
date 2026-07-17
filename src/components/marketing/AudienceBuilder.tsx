"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ItemPicker } from "@/components/price-book/ItemPicker";
import type { AudienceFilters, AudiencePreviewCustomer } from "@/lib/marketing/types";
import type { PriceBookItemDTO } from "@/lib/price-book/types";
import { cn } from "@/lib/utils";

type Props = {
  channel: "EMAIL" | "SMS";
  filters: AudienceFilters;
  onChange: (filters: AudienceFilters) => void;
};

export function AudienceBuilder({ channel, filters, onChange }: Props) {
  const [cities, setCities] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [cityInput, setCityInput] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [preview, setPreview] = useState<{
    count: number;
    sample: AudiencePreviewCustomer[];
    customers?: AudiencePreviewCustomer[];
  } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Array<{ id: string; name: string }>>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [manualMode, setManualMode] = useState(
    Boolean(filters.includeCustomerIds?.length || filters.excludeCustomerIds?.length)
  );

  useEffect(() => {
    fetch("/api/marketing/audience/filters")
      .then((r) => r.json())
      .then((data) => {
        setCities(data.cities ?? []);
        setAvailableTags(data.tags ?? []);
      })
      .catch(() => {});
  }, []);

  const refreshPreview = useCallback(async () => {
    setLoadingPreview(true);
    try {
      const res = await fetch("/api/marketing/audience/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          filters: {
            ...filters,
            priceBookItemIds: selectedItems.map((i) => i.id),
            // Preview base list without include/exclude so user can pick from filter results
            includeCustomerIds: undefined,
            excludeCustomerIds: undefined,
          },
          includeCustomers: true,
        }),
      });
      if (res.ok) setPreview(await res.json());
    } finally {
      setLoadingPreview(false);
    }
  }, [channel, filters, selectedItems]);

  useEffect(() => {
    const timer = setTimeout(refreshPreview, 300);
    return () => clearTimeout(timer);
  }, [refreshPreview]);

  function update(partial: Partial<AudienceFilters>) {
    onChange({
      ...filters,
      ...partial,
      priceBookItemIds: selectedItems.map((i) => i.id),
    });
  }

  function addCity(city: string) {
    const value = city.trim();
    if (!value) return;
    const next = [...(filters.cities ?? [])];
    if (!next.includes(value)) next.push(value);
    update({ cities: next });
    setCityInput("");
  }

  function addTag(tag: string) {
    const value = tag.trim();
    if (!value) return;
    const next = [...(filters.tags ?? [])];
    if (!next.includes(value)) next.push(value);
    update({ tags: next });
    setTagInput("");
  }

  function onItemPicked(item: PriceBookItemDTO) {
    setSelectedItems((prev) => {
      if (prev.some((p) => p.id === item.id)) return prev;
      return [...prev, { id: item.id, name: item.name }];
    });
    setPickerOpen(false);
  }

  useEffect(() => {
    onChange({
      ...filters,
      priceBookItemIds: selectedItems.map((i) => i.id),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItems]);

  const baseCustomers = preview?.customers ?? preview?.sample ?? [];
  const excluded = new Set(filters.excludeCustomerIds ?? []);
  const included = filters.includeCustomerIds ?? [];
  const includeSet = new Set(included);

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    return baseCustomers.filter((c) => {
      if (!q) return true;
      return `${c.name} ${c.email ?? ""} ${c.phone ?? ""} ${c.city ?? ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [baseCustomers, customerSearch]);

  function isSelected(id: string) {
    if (includeSet.size > 0) return includeSet.has(id) && !excluded.has(id);
    return !excluded.has(id);
  }

  function toggleCustomer(id: string) {
    if (includeSet.size > 0) {
      // Explicit include mode
      if (includeSet.has(id)) {
        const next = included.filter((x) => x !== id);
        update({
          includeCustomerIds: next.length ? next : undefined,
          excludeCustomerIds: undefined,
        });
      } else {
        update({
          includeCustomerIds: [...included, id],
          excludeCustomerIds: undefined,
        });
      }
      return;
    }

    // Exclude mode (everyone matching filters minus deselected)
    if (excluded.has(id)) {
      update({
        excludeCustomerIds: (filters.excludeCustomerIds ?? []).filter((x) => x !== id),
      });
    } else {
      update({
        excludeCustomerIds: [...(filters.excludeCustomerIds ?? []), id],
      });
    }
  }

  function selectAllVisible() {
    update({
      includeCustomerIds: filteredCustomers.map((c) => c.id),
      excludeCustomerIds: undefined,
    });
    setManualMode(true);
  }

  function clearSelectionOverrides() {
    update({ includeCustomerIds: undefined, excludeCustomerIds: undefined });
    setManualMode(false);
  }

  const effectiveCount = (() => {
    if (!baseCustomers.length) return preview?.count ?? 0;
    return baseCustomers.filter((c) => isSelected(c.id)).length;
  })();

  return (
    <div className="space-y-5">
      <div>
        <label className="text-sm font-medium">Cities</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {(filters.cities ?? []).map((city) => (
            <Badge key={city} variant="secondary" className="gap-1 pr-1">
              {city}
              <button
                type="button"
                onClick={() => update({ cities: filters.cities?.filter((c) => c !== city) })}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <Input
            list="audience-cities"
            value={cityInput}
            onChange={(e) => setCityInput(e.target.value)}
            placeholder="Add city..."
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCity(cityInput);
              }
            }}
          />
          <Button type="button" variant="outline" onClick={() => addCity(cityInput)}>
            Add
          </Button>
        </div>
        <datalist id="audience-cities">
          {cities.map((city) => (
            <option key={city} value={city} />
          ))}
        </datalist>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-sm font-medium">Serviced from</label>
          <Input
            type="date"
            className="mt-1"
            value={filters.servicedFrom?.slice(0, 10) ?? ""}
            onChange={(e) => update({ servicedFrom: e.target.value || undefined })}
          />
        </div>
        <div>
          <label className="text-sm font-medium">Serviced to</label>
          <Input
            type="date"
            className="mt-1"
            value={filters.servicedTo?.slice(0, 10) ?? ""}
            onChange={(e) => update({ servicedTo: e.target.value || undefined })}
          />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">Services received (price book)</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {selectedItems.map((item) => (
            <Badge key={item.id} variant="outline" className="gap-1 pr-1">
              {item.name}
              <button
                type="button"
                onClick={() => setSelectedItems((prev) => prev.filter((p) => p.id !== item.id))}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={() => setPickerOpen(true)}
        >
          Add service
        </Button>
        <ItemPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={onItemPicked} />
      </div>

      <div>
        <label className="text-sm font-medium">Customer tags</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {(filters.tags ?? []).map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1 pr-1">
              {tag}
              <button
                type="button"
                onClick={() => update({ tags: filters.tags?.filter((t) => t !== tag) })}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <Input
            list="audience-tags"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            placeholder="Add tag filter..."
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag(tagInput);
              }
            }}
          />
          <Button type="button" variant="outline" onClick={() => addTag(tagInput)}>
            Add
          </Button>
        </div>
        <datalist id="audience-tags">
          {availableTags.map((tag) => (
            <option key={tag} value={tag} />
          ))}
        </datalist>
      </div>

      <div className="rounded-lg border bg-muted/30 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">
            {loadingPreview
              ? "Calculating audience..."
              : `${effectiveCount} customer${effectiveCount === 1 ? "" : "s"} selected`}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={selectAllVisible}>
              Select all matching
            </Button>
            {(manualMode ||
              filters.includeCustomerIds?.length ||
              filters.excludeCustomerIds?.length) && (
              <Button type="button" size="sm" variant="ghost" onClick={clearSelectionOverrides}>
                Reset picks
              </Button>
            )}
          </div>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Click customers below to include or exclude them from this campaign.
        </p>
        <Input
          className="mt-3"
          value={customerSearch}
          onChange={(e) => setCustomerSearch(e.target.value)}
          placeholder="Search customers…"
        />
        <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto">
          {filteredCustomers.map((c) => {
            const selected = isSelected(c.id);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    setManualMode(true);
                    toggleCustomer(c.id);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                    selected
                      ? "border-primary/40 bg-primary/5"
                      : "border-transparent bg-background/60 opacity-60 hover:opacity-100"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded border",
                      selected ? "border-primary bg-primary text-primary-foreground" : "border-input"
                    )}
                  >
                    {selected ? <Check className="h-3 w-3" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{c.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[c.email, c.phone, c.city].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
          {!loadingPreview && filteredCustomers.length === 0 ? (
            <li className="py-4 text-center text-sm text-muted-foreground">
              No matching customers for these filters.
            </li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
