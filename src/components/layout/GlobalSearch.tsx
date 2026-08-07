"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  FileText,
  Loader2,
  Search,
  User,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { GlobalSearchResult } from "@/lib/search/global-search";

type SearchSectionKey = "customers" | "employees" | "priceBook" | "pages";

type FlatHit = {
  key: string;
  section: SearchSectionKey;
  href: string;
  title: string;
  subtitle: string | null;
  meta: string | null;
  path?: string;
};

const SECTION_META: Record<
  SearchSectionKey,
  { label: string; icon: typeof User; badgeClass: string; iconClass: string }
> = {
  customers: {
    label: "Customers",
    icon: User,
    badgeClass: "bg-sky-100 text-sky-800 border-sky-200",
    iconClass: "text-sky-700",
  },
  employees: {
    label: "Employees",
    icon: Users,
    badgeClass: "bg-violet-100 text-violet-800 border-violet-200",
    iconClass: "text-violet-700",
  },
  priceBook: {
    label: "Price book",
    icon: BookOpen,
    badgeClass: "bg-amber-100 text-amber-900 border-amber-200",
    iconClass: "text-amber-800",
  },
  pages: {
    label: "Pages",
    icon: FileText,
    badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-200",
    iconClass: "text-emerald-700",
  },
};

function flattenResults(data: GlobalSearchResult | null): FlatHit[] {
  if (!data) return [];
  const hits: FlatHit[] = [];
  for (const c of data.customers) {
    hits.push({
      key: `customer:${c.id}`,
      section: "customers",
      href: c.href,
      title: c.title,
      subtitle: c.subtitle,
      meta: c.meta,
    });
  }
  for (const e of data.employees) {
    hits.push({
      key: `employee:${e.id}`,
      section: "employees",
      href: e.href,
      title: e.title,
      subtitle: e.subtitle,
      meta: e.meta,
    });
  }
  for (const p of data.priceBook) {
    hits.push({
      key: `price_book:${p.id}`,
      section: "priceBook",
      href: p.href,
      title: p.title,
      subtitle: p.subtitle,
      meta: p.meta,
    });
  }
  for (const page of data.pages) {
    hits.push({
      key: page.id,
      section: "pages",
      href: page.href,
      title: page.title,
      subtitle: page.path !== page.title ? page.path : null,
      meta: null,
      path: page.path,
    });
  }
  return hits;
}

function GlobalSearchDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<GlobalSearchResult | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const flat = flattenResults(results);
  const hasQuery = query.trim().length >= 2;
  const empty =
    hasQuery &&
    !loading &&
    results != null &&
    flat.length === 0;

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults(null);
    setActiveIndex(0);
    const t = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data: GlobalSearchResult | null) => {
          if (cancelled) return;
          setResults(data);
          setActiveIndex(0);
        })
        .catch(() => {
          if (!cancelled) setResults(null);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, open]);

  const goTo = useCallback(
    (href: string) => {
      onClose();
      router.push(href);
    },
    [onClose, router]
  );

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (!flat.length) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % flat.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + flat.length) % flat.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const hit = flat[activeIndex];
        if (hit) goTo(hit.href);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, flat, activeIndex, goTo, onClose]);

  if (!open) return null;

  const sectionOrder: SearchSectionKey[] = [
    "customers",
    "employees",
    "priceBook",
    "pages",
  ];
  const sections = sectionOrder
    .map((key) => ({
      key,
      items: flat.filter((h) => h.section === key),
    }))
    .filter((s) => s.items.length > 0);

  let runningIndex = -1;

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center p-3 pt-[12vh] sm:p-4 sm:pt-[14vh]">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close search"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search CRM"
        className="relative z-10 flex w-full max-w-xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search customers, employees, price book, pages…"
            className="h-9 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            aria-autocomplete="list"
            aria-controls={listId}
            aria-expanded={hasQuery}
            autoComplete="off"
          />
          {loading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" /> : null}
          <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div id={listId} className="max-h-[min(28rem,55vh)] overflow-y-auto" role="listbox">
          {!hasQuery ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              Type at least 2 characters. Find customers by name, phone, email, or address —
              plus employees, price book items, and CRM pages.
            </p>
          ) : empty ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">No matches for “{query.trim()}”.</p>
          ) : (
            <div className="py-2">
              {sections.map((section) => {
                const meta = SECTION_META[section.key];
                const Icon = meta.icon;
                return (
                  <div key={section.key} className="mb-1">
                    <div className="sticky top-0 z-[1] flex items-center gap-2 bg-background/95 px-4 py-1.5 backdrop-blur">
                      <Icon className={cn("h-3.5 w-3.5", meta.iconClass)} aria-hidden />
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {meta.label}
                      </span>
                      <span
                        className={cn(
                          "rounded-full border px-1.5 py-0 text-[10px] font-semibold",
                          meta.badgeClass
                        )}
                      >
                        {section.items.length}
                      </span>
                    </div>
                    <ul>
                      {section.items.map((hit) => {
                        runningIndex += 1;
                        const index = runningIndex;
                        const active = index === activeIndex;
                        return (
                          <li key={hit.key} role="option" aria-selected={active}>
                            <Link
                              href={hit.href}
                              onClick={onClose}
                              onMouseEnter={() => setActiveIndex(index)}
                              className={cn(
                                "flex items-start gap-3 px-4 py-2.5 transition-colors",
                                active ? "bg-muted" : "hover:bg-muted/60"
                              )}
                            >
                              <span
                                className={cn(
                                  "mt-0.5 shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                                  meta.badgeClass
                                )}
                              >
                                {section.key === "priceBook"
                                  ? "Item"
                                  : section.key === "customers"
                                    ? "Cust"
                                    : section.key === "employees"
                                      ? "Emp"
                                      : "Page"}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium text-foreground">
                                  {hit.title}
                                </span>
                                {hit.subtitle ? (
                                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                                    {hit.subtitle}
                                  </span>
                                ) : null}
                                {hit.meta ? (
                                  <span className="mt-0.5 block truncate text-xs text-muted-foreground/80">
                                    {hit.meta}
                                  </span>
                                ) : null}
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function GlobalSearchButton() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) {
          return;
        }
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        type="button"
        aria-label="Search CRM"
        title="Search (Ctrl+K)"
        onClick={() => setOpen(true)}
      >
        <Search className="h-5 w-5" />
      </Button>
      <GlobalSearchDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
