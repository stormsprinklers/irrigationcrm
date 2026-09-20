"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import type { NavSection } from "@/config/navigation";
import { cn } from "@/lib/utils";

type SettingsSearchProps = {
  sections: NavSection[];
  onNavigate?: () => void;
};

type SettingsSearchItem = {
  href: string;
  label: string;
  group: string;
  searchText: string;
};

const SETTINGS_KEYWORDS: Record<string, string> = {
  "/settings": "business company information details name address phone email website timezone license",
  "/settings/appearance": "appearance branding theme logo colors colour dark mode night mode email branding",
  "/settings/holiday-lighting": "holiday christmas lights lighting prices pricing discounts options editor",
  "/settings/role-preview": "roles permissions access preview employee user",
  "/settings/storm-ai": "storm ai artificial intelligence assistant general",
  "/settings/storm-ai/policies": "company policies ai instructions rules answers knowledge",
  "/settings/storm-ai/technician-assistant": "technician assistant troubleshooting field tech ai issues",
  "/settings/storm-ai/technician-assistant/parts": "parts info materials technician assistant",
  "/settings/employees": "employees users team staff technicians csr manager admin invite permissions",
  "/settings/employees/schedules": "work hours schedule shifts employee availability start end time",
  "/settings/field-devices": "field devices mobile pwa phones tablets technician access",
  "/settings/compensation": "compensation pay wages commission payroll employees",
  "/settings/service-areas": "service areas territory zip code postal city coverage",
  "/settings/notifications": "notifications customer messages templates appointment confirmation reminder arrival review request email sms",
  "/settings/campaign-links": "campaign settings marketing email sms links tracking twilio sendgrid daily limits quiet hours",
  "/settings/media-library": "media library files images photos uploads attachments",
  "/settings/inbox": "inbox email sms text messaging sender address twilio signature spam blocked",
  "/settings/voice": "voice phone calling calls overview twilio",
  "/settings/voice/numbers": "phone numbers caller id voice sms twilio",
  "/settings/voice/flows": "call flows routing phone menu voicemail forwarding",
  "/settings/voice/clips": "audio clips recordings greetings hold music voicemail",
  "/settings/voice/groups": "agent groups ring groups call routing employees",
  "/settings/voice/hours": "business hours open closed phone calls after hours",
  "/settings/parts-suppliers": "suppliers vendors parts materials purchasing",
  "/settings/integrations": "integrations connections apps accounts overview",
  "/settings/integrations/slack": "slack integration notifications messages",
  "/settings/integrations/meta": "meta facebook instagram webhooks social leads",
  "/settings/integrations/google-business": "google business profile gbp reviews maps",
  "/settings/integrations/google-ads": "google ads advertising ppc conversions tracking",
  "/settings/integrations/meta-ads": "meta ads facebook instagram advertising campaigns",
  "/settings/integrations/rachio": "rachio sprinkler irrigation controller integration",
  "/settings/integrations/apple-demo": "apple demo integration",
  "/settings/integrations/serp-rankings": "search rankings seo serp keywords google",
  "/settings/integrations/migrations/housecall-pro": "data migration import housecall pro customers contacts csv",
  "/settings/integrations/create-company": "company accounts create business account",
  "/settings/booking": "booking scheduling appointment arrival window duration open slots availability capacity lead time override",
  "/settings/customer-portal": "customer portal online account payments estimates invoices appointments",
  "/settings/leads": "lead sources marketing attribution referral tracking",
  "/settings/price-book": "price book pricing services materials overview",
  "/settings/price-book/labor-rates": "labor rates hourly technician cost pricing",
  "/settings/price-book/material-markups": "material markups parts margin cost pricing",
  "/settings/price-book/bulk-adjust": "bulk adjust prices pricing increase decrease",
  "/settings/estimates": "estimates quotes proposals options expiration deposit",
  "/settings/checklists": "checklists visits jobs technician tasks",
  "/settings/invoices": "invoices billing payments terms due tax",
};

function normalize(value: string) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function buildSearchItems(sections: NavSection[]): SettingsSearchItem[] {
  const items: SettingsSearchItem[] = [];
  const seen = new Set<string>();

  for (const section of sections) {
    for (const item of section.items) {
      const candidates = item.children?.length
        ? item.children.map((child) => ({ item: child, group: item.label }))
        : [{ item, group: section.title || "Settings" }];

      for (const candidate of candidates) {
        if (seen.has(candidate.item.href)) continue;
        seen.add(candidate.item.href);
        items.push({
          href: candidate.item.href,
          label: candidate.item.label,
          group: candidate.group,
          searchText: normalize(
            `${candidate.item.label} ${candidate.group} ${SETTINGS_KEYWORDS[candidate.item.href] || ""}`
          ),
        });
      }
    }
  }

  return items;
}

function scoreItem(item: SettingsSearchItem, query: string) {
  const label = normalize(item.label);
  const group = normalize(item.group);
  if (label === query) return 0;
  if (label.startsWith(query)) return 1;
  if (group === query) return 2;
  if (label.includes(query)) return 3;
  if (group.startsWith(query)) return 4;
  return 5;
}

export function SettingsSearch({ sections, onNavigate }: SettingsSearchProps) {
  const router = useRouter();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const allItems = useMemo(() => buildSearchItems(sections), [sections]);
  const normalizedQuery = normalize(query);
  const results = useMemo(() => {
    if (!normalizedQuery) return [];
    const terms = normalizedQuery.split(" ").filter(Boolean);
    return allItems
      .filter((item) => terms.every((term) => item.searchText.includes(term)))
      .sort((a, b) => scoreItem(a, normalizedQuery) - scoreItem(b, normalizedQuery))
      .slice(0, 12);
  }, [allItems, normalizedQuery]);
  const showResults = focused && Boolean(normalizedQuery);

  useEffect(() => {
    setActiveIndex(0);
  }, [normalizedQuery]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setFocused(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  function navigate(href: string) {
    setQuery("");
    setFocused(false);
    onNavigate?.();
    router.push(href);
  }

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="search"
          value={query}
          onFocus={() => setFocused(true)}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setQuery("");
              setFocused(false);
              event.currentTarget.blur();
              return;
            }
            if (!results.length) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((index) => (index + 1) % results.length);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((index) => (index - 1 + results.length) % results.length);
            } else if (event.key === "Enter") {
              event.preventDefault();
              const result = results[activeIndex];
              if (result) navigate(result.href);
            }
          }}
          placeholder="Search settings…"
          aria-label="Search settings"
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={showResults}
          autoComplete="off"
          className="h-9 w-full rounded-md border border-input bg-background py-1 pl-8 pr-8 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Clear settings search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {showResults ? (
        <div
          id={listId}
          role="listbox"
          aria-label="Settings search results"
          className="absolute left-0 right-0 top-full z-30 mt-1.5 max-h-80 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-xl"
        >
          {results.length ? (
            results.map((result, index) => (
              <button
                key={result.href}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => navigate(result.href)}
                className={cn(
                  "flex w-full flex-col rounded px-2.5 py-2 text-left transition-colors",
                  index === activeIndex ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                )}
              >
                <span className="text-sm font-medium">{result.label}</span>
                <span className="text-xs text-muted-foreground">{result.group}</span>
              </button>
            ))
          ) : (
            <p className="px-2.5 py-3 text-sm text-muted-foreground">
              No settings match “{query.trim()}”.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
