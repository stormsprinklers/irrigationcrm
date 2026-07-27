"use client";

import { useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  STRIPE_ISSUING_CATEGORIES,
  stripeCategoryLabel,
} from "@/lib/expense-cards/stripe-categories";
import { DEFAULT_ALLOWED_CATEGORIES } from "@/lib/expense-cards/controls";

type CategoryMultiSelectProps = {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
};

export function StripeCategoryMultiSelect({
  value,
  onChange,
  disabled,
}: CategoryMultiSelectProps) {
  const [query, setQuery] = useState("");
  const selected = useMemo(() => new Set(value), [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // Prefer defaults + selected first when not searching
      const preferred = new Set<string>([...DEFAULT_ALLOWED_CATEGORIES, ...value]);
      return [
        ...STRIPE_ISSUING_CATEGORIES.filter((c) => preferred.has(c)),
        ...STRIPE_ISSUING_CATEGORIES.filter((c) => !preferred.has(c)),
      ];
    }
    return STRIPE_ISSUING_CATEGORIES.filter((c) => {
      const label = stripeCategoryLabel(c).toLowerCase();
      return c.includes(q) || label.includes(q);
    });
  }, [query, value]);

  const toggle = (category: string) => {
    if (disabled) return;
    if (selected.has(category)) {
      onChange(value.filter((c) => c !== category));
    } else {
      onChange([...value, category]);
    }
  };

  return (
    <div className="space-y-2">
      <Input
        placeholder="Search Stripe merchant categories…"
        value={query}
        disabled={disabled}
        onChange={(e) => setQuery(e.target.value)}
      />
      <p className="text-xs text-muted-foreground">
        {value.length} selected · values must match Stripe Issuing{" "}
        <code className="text-[11px]">allowed_categories</code>
      </p>
      <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-border p-2">
        {filtered.slice(0, query.trim() ? 80 : 40).map((category) => (
          <label
            key={category}
            className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 hover:bg-muted/50"
          >
            <Checkbox
              checked={selected.has(category)}
              disabled={disabled}
              onCheckedChange={() => toggle(category)}
              className="mt-0.5"
            />
            <span className="min-w-0">
              <span className="block text-sm">{stripeCategoryLabel(category)}</span>
              <span className="block truncate font-mono text-[11px] text-muted-foreground">
                {category}
              </span>
            </span>
          </label>
        ))}
        {!query.trim() && filtered.length > 40 ? (
          <p className="px-1 py-2 text-xs text-muted-foreground">
            Showing recommended categories first. Search to browse all{" "}
            {STRIPE_ISSUING_CATEGORIES.length}.
          </p>
        ) : null}
      </div>
    </div>
  );
}
