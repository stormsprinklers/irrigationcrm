"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { useHolidayLightingFeatures } from "@/components/layout/CompanyBrandProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type QuoteRow = {
  id: string;
  address: string | null;
  city: string | null;
  status: string;
  updatedAt: string;
  customer?: { name: string } | null;
  estimate?: { estimateNumber: string | null } | null;
  priceRange: { min: number; max: number } | null;
};

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function formatPriceRange(range: QuoteRow["priceRange"]) {
  if (!range) return null;
  const minimum = money.format(range.min);
  const maximum = money.format(range.max);
  return range.min === range.max ? minimum : `${minimum}–${maximum}`;
}

export default function HolidayLightingQuoteListPage() {
  const { enabled } = useHolidayLightingFeatures();
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [pageSize, total]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (search) params.set("search", search);
    setLoading(true);
    fetch(`/api/holiday-lighting/quotes?${params}`, { signal: controller.signal })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Failed");
        setQuotes(data.quotes ?? []);
        setTotal(data.total ?? 0);
        const lastPage = Math.max(1, Math.ceil((data.total ?? 0) / pageSize));
        if (page > lastPage) setPage(lastPage);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        toast.error(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [enabled, page, pageSize, search]);

  if (!enabled) {
    return (
      <ContentArea>
        <PageHeader title="Holiday lighting" />
        <p className="text-sm text-muted-foreground">
          Holiday lighting tools are off. Enable them under{" "}
          <Link href="/settings" className="text-primary underline">
            Settings → Company → Industry features
          </Link>
          .
        </p>
      </ContentArea>
    );
  }

  return (
    <ContentArea className="max-w-4xl">
      <PageHeader
        title="Holiday lighting quotes"
        subtitle="Measure roofs on satellite / Street View, build a quote, and send a branded estimate."
        actions={
          <Button asChild size="sm">
            <Link href="/holiday-lighting/quote/new">
              <Plus className="mr-1.5 h-4 w-4" />
              New quote
            </Link>
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search customer or address"
            aria-label="Search holiday lighting quotes by customer name or address"
            className="pl-9 pr-9"
          />
          {searchInput ? (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Clear quote search"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Rows per page
          <select
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value));
              setPage(1);
            }}
            className="rounded border border-border bg-white px-2 py-1.5 text-sm text-foreground"
          >
            {[10, 25, 50].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : quotes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {search ? `No quotes found for “${search}”.` : "No quotes yet."}
        </p>
      ) : (
        <>
          <ul className="divide-y rounded-lg border border-border bg-white">
            {quotes.map((q) => (
              <li key={q.id}>
                <Link
                  href={`/holiday-lighting/quote/${q.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted/40"
                >
                  <span>
                    <span className="font-medium">
                      {q.customer?.name ??
                        ([q.address, q.city].filter(Boolean).join(", ") || "Untitled")}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {q.status}
                      {q.estimate?.estimateNumber ? ` · ${q.estimate.estimateNumber}` : ""}
                    </span>
                    {q.priceRange ? (
                      <span className="mt-1 block text-xs font-semibold text-foreground">
                        {formatPriceRange(q.priceRange)}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(q.updatedAt).toLocaleDateString()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>
              Page {page} of {totalPages} · {total} {total === 1 ? "quote" : "quotes"}
            </span>
            <div className="flex gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1 || loading}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page >= totalPages || loading}
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </>
      )}
    </ContentArea>
  );
}
