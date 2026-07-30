"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { useHolidayLightingFeatures } from "@/components/layout/CompanyBrandProvider";
import { Button } from "@/components/ui/button";

type QuoteRow = {
  id: string;
  address: string | null;
  city: string | null;
  status: string;
  updatedAt: string;
  customer?: { name: string } | null;
  estimate?: { estimateNumber: string | null } | null;
};

export default function HolidayLightingQuoteListPage() {
  const { enabled } = useHolidayLightingFeatures();
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    fetch("/api/holiday-lighting/quotes")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Failed");
        setQuotes(data.quotes ?? []);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [enabled]);

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
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : quotes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No quotes yet.</p>
      ) : (
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
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(q.updatedAt).toLocaleDateString()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </ContentArea>
  );
}
