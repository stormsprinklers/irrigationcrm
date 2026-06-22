"use client";

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ItemPicker } from "@/components/price-book/ItemPicker";
import type { AudienceFilters } from "@/lib/marketing/types";
import type { PriceBookItemDTO } from "@/lib/price-book/types";

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
  const [preview, setPreview] = useState<{ count: number; sample: Array<{ name: string }> } | null>(
    null
  );
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Array<{ id: string; name: string }>>([]);

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
          },
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
    onChange({ ...filters, ...partial });
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
    update({ priceBookItemIds: selectedItems.map((i) => i.id) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItems]);

  return (
    <div className="space-y-5">
      <div>
        <label className="text-sm font-medium">Cities</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {(filters.cities ?? []).map((city) => (
            <Badge key={city} variant="secondary" className="gap-1 pr-1">
              {city}
              <button type="button" onClick={() => update({ cities: filters.cities?.filter((c) => c !== city) })}>
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
        <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setPickerOpen(true)}>
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
              <button type="button" onClick={() => update({ tags: filters.tags?.filter((t) => t !== tag) })}>
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
        <p className="text-sm font-medium">
          {loadingPreview ? "Calculating audience..." : `${preview?.count ?? 0} matching customers`}
        </p>
        {preview?.sample?.length ? (
          <ul className="mt-2 text-sm text-muted-foreground">
            {preview.sample.map((c) => (
              <li key={c.name}>{c.name}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
