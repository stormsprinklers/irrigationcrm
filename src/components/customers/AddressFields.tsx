"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { ResolvedAddress } from "@/lib/customers/address-autocomplete";

export type AddressFieldValue = {
  address: string;
  city: string;
  state: string;
  zip: string;
  latitude?: number | null;
  longitude?: number | null;
};

type Suggestion = {
  placeId: string;
  label: string;
  mainText: string;
  secondaryText: string;
};

type AddressAutocompleteInputProps = {
  value: string;
  onChange: (value: string) => void;
  onResolved?: (resolved: ResolvedAddress) => void;
  placeholder?: string;
  disabled?: boolean;
  autoComplete?: string;
  id?: string;
};

export function AddressAutocompleteInput({
  value,
  onChange,
  onResolved,
  placeholder = "Start typing an address...",
  disabled,
  autoComplete = "street-address",
  id,
}: AddressAutocompleteInputProps) {
  const listId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    if (disabled) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    const trimmed = value.trim();
    if (trimmed.length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      fetch(`/api/maps/address-autocomplete?input=${encodeURIComponent(trimmed)}`, {
        signal: controller.signal,
      })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            setSuggestions([]);
            setOpen(false);
            return;
          }
          const next = (data.suggestions ?? []) as Suggestion[];
          setSuggestions(next);
          setOpen(next.length > 0);
          setActiveIndex(-1);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setSuggestions([]);
          setOpen(false);
        })
        .finally(() => setLoading(false));
    }, 300);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [value, disabled]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  async function selectSuggestion(suggestion: Suggestion) {
    setOpen(false);
    setSuggestions([]);
    setResolving(true);
    try {
      const res = await fetch(
        `/api/maps/address-autocomplete?placeId=${encodeURIComponent(suggestion.placeId)}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      onResolved?.(data.address as ResolvedAddress);
    } finally {
      setResolving(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete={autoComplete}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          onFocus={() => {
            if (suggestions.length > 0) setOpen(true);
          }}
          onKeyDown={(e) => {
            if (!open || suggestions.length === 0) return;

            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActiveIndex((index) => (index + 1) % suggestions.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIndex((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
            } else if (e.key === "Enter" && activeIndex >= 0) {
              e.preventDefault();
              void selectSuggestion(suggestions[activeIndex]!);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        {loading || resolving ? (
          <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      {open && suggestions.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border bg-background shadow-md"
        >
          {suggestions.map((suggestion, index) => (
            <li key={suggestion.placeId} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={`flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-muted ${
                  index === activeIndex ? "bg-muted" : ""
                }`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void selectSuggestion(suggestion)}
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span>
                  <span className="block font-medium">{suggestion.mainText || suggestion.label}</span>
                  {suggestion.secondaryText ? (
                    <span className="block text-xs text-muted-foreground">
                      {suggestion.secondaryText}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

type AddressFieldsProps = {
  value: AddressFieldValue;
  onChange: (value: AddressFieldValue) => void;
  disabled?: boolean;
  addressLabel?: string;
};

export function AddressFields({
  value,
  onChange,
  disabled,
  addressLabel = "Address",
}: AddressFieldsProps) {
  function applyResolved(resolved: ResolvedAddress) {
    onChange({
      ...value,
      address: resolved.address ?? value.address,
      city: resolved.city ?? value.city,
      state: resolved.state ?? value.state,
      zip: resolved.zip ?? value.zip,
      latitude: resolved.latitude,
      longitude: resolved.longitude,
    });
  }

  return (
    <>
      <div className="sm:col-span-2">
        <label className="mb-1 block text-sm font-medium">{addressLabel}</label>
        <AddressAutocompleteInput
          value={value.address}
          onChange={(address) =>
            onChange({ ...value, address, latitude: null, longitude: null })
          }
          onResolved={applyResolved}
          disabled={disabled}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Suggestions appear as you type. You can also enter the address manually.
        </p>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">City</label>
        <Input
          value={value.city}
          onChange={(e) => onChange({ ...value, city: e.target.value })}
          disabled={disabled}
          autoComplete="address-level2"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">State</label>
        <Input
          value={value.state}
          onChange={(e) => onChange({ ...value, state: e.target.value })}
          disabled={disabled}
          autoComplete="address-level1"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">ZIP</label>
        <Input
          value={value.zip}
          onChange={(e) => onChange({ ...value, zip: e.target.value })}
          disabled={disabled}
          autoComplete="postal-code"
        />
      </div>
    </>
  );
}
