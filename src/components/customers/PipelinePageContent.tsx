"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Download } from "lucide-react";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type PipelineRow = {
  id: string;
  name: string;
  city: string | null;
  zip: string | null;
  createdAt: string;
  pipelineStage: string;
  pipelineLeadAt: string;
  pipelineQualifiedAt: string | null;
  pipelineConvertedAt: string | null;
  pipelineSoldAt: string | null;
  pipelineDisqualifiedAt: string | null;
  pipelineLeadSource: string | null;
  pipelineFirstContactedAt: string | null;
  speedSeconds: number | null;
};

type PipelineResponse = {
  rows: PipelineRow[];
  total: number;
  page: number;
  pageSize: number;
  metrics: {
    leadCount: number;
    qualifiedCount: number;
    convertedCount: number;
    soldCount: number;
    averageSpeedSeconds: number | null;
  };
};

type FilterDraft = {
  search: string;
  city: string;
  zip: string;
  createdFrom: string;
  createdTo: string;
  speed: string;
};

function draftFromParams(params: URLSearchParams): FilterDraft {
  return {
    search: params.get("search") ?? "",
    city: params.get("city") ?? "",
    zip: params.get("zip") ?? "",
    createdFrom: params.get("createdFrom") ?? "",
    createdTo: params.get("createdTo") ?? "",
    speed: params.get("speed") ?? "",
  };
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatSpeed(seconds: number | null) {
  if (seconds == null) return "No response time";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function speedClass(seconds: number | null) {
  if (seconds == null) return "border-muted bg-muted/40 text-muted-foreground";
  if (seconds < 300) return "border-green-200 bg-green-100 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300";
  if (seconds <= 1800) return "border-yellow-200 bg-yellow-100 text-yellow-800 dark:border-yellow-900 dark:bg-yellow-950 dark:text-yellow-300";
  return "border-red-200 bg-red-100 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300";
}

function percent(count: number, previous: number) {
  if (previous <= 0) return "0%";
  return `${Math.round((count / previous) * 100)}%`;
}

function StageCell({ at }: { at: string | null }) {
  if (!at) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex min-w-40 items-start gap-2">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" aria-hidden="true" />
      <span className="text-xs leading-5">{formatDateTime(at)}</span>
    </div>
  );
}
export function PipelinePageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const [draft, setDraft] = useState<FilterDraft>(() =>
    draftFromParams(new URLSearchParams(queryString))
  );
  const [data, setData] = useState<PipelineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(draftFromParams(new URLSearchParams(queryString)));
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/customers/pipeline${queryString ? `?${queryString}` : ""}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error ?? "Could not load pipeline");
        }
        return response.json() as Promise<PipelineResponse>;
      })
      .then(setData)
      .catch((fetchError) => {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") return;
        setError(fetchError instanceof Error ? fetchError.message : "Could not load pipeline");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [queryString]);

  const exportHref = useMemo(() => {
    const params = new URLSearchParams(queryString);
    params.delete("page");
    params.set("format", "csv");
    return `/api/customers/pipeline?${params.toString()}`;
  }, [queryString]);

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(draft)) {
      if (value.trim()) params.set(key, value.trim());
    }
    router.push(`${pathname}${params.size ? `?${params.toString()}` : ""}`);
  }

  function clearFilters() {
    setDraft({ search: "", city: "", zip: "", createdFrom: "", createdTo: "", speed: "" });
    router.push(pathname);
  }

  function setPage(page: number) {
    const params = new URLSearchParams(queryString);
    if (page <= 1) params.delete("page");
    else params.set("page", String(page));
    router.push(`${pathname}${params.size ? `?${params.toString()}` : ""}`);
  }

  const metrics = data?.metrics;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <ContentArea>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          breadcrumb={["Customers", "Pipeline"]}
          title="Sales pipeline"
          subtitle="Track each customer from first lead through paid work. Pipeline stages are internal and are never shown to customers."
        />
        <Button variant="outline" asChild>
          <a href={exportHref} download>
            <Download className="h-4 w-4" />
            Export CSV
          </a>
        </Button>
      </div>

      <form onSubmit={applyFilters} className="mb-5 grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-2 xl:grid-cols-7">
        <Input
          aria-label="Search customer name"
          placeholder="Customer name"
          value={draft.search}
          onChange={(event) => setDraft((current) => ({ ...current, search: event.target.value }))}
        />
        <Input
          aria-label="Filter by city"
          placeholder="City"
          value={draft.city}
          onChange={(event) => setDraft((current) => ({ ...current, city: event.target.value }))}
        />
        <Input
          aria-label="Filter by ZIP code"
          placeholder="ZIP code"
          value={draft.zip}
          onChange={(event) => setDraft((current) => ({ ...current, zip: event.target.value }))}
        />
        <Input
          aria-label="Created from"
          type="date"
          value={draft.createdFrom}
          onChange={(event) => setDraft((current) => ({ ...current, createdFrom: event.target.value }))}
        />
        <Input
          aria-label="Created through"
          type="date"
          value={draft.createdTo}
          onChange={(event) => setDraft((current) => ({ ...current, createdTo: event.target.value }))}
        />
        <select
          aria-label="Filter by speed to lead"
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          value={draft.speed}
          onChange={(event) => setDraft((current) => ({ ...current, speed: event.target.value }))}
        >
          <option value="">All response times</option>
          <option value="UNDER_5">Under 5 minutes</option>
          <option value="FIVE_TO_30">5–30 minutes</option>
          <option value="OVER_30">Over 30 minutes</option>
        </select>
        <div className="flex gap-2">
          <Button type="submit" className="flex-1">Apply</Button>
          <Button type="button" variant="outline" onClick={clearFilters}>Clear</Button>
        </div>
      </form>

      {error ? <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{error}</div> : null}
      {loading ? <p className="py-8 text-center text-sm text-muted-foreground">Loading pipeline…</p> : null}

      {!loading && data ? (
        <>
          <div className="overflow-x-auto rounded-lg border bg-card">
            <Table className="min-w-[1050px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Customer name</TableHead>
                  <TableHead>
                    <div>Lead</div>
                    <div className="text-xs font-normal text-muted-foreground">
                      {metrics?.leadCount ?? 0} leads · Avg {formatSpeed(metrics?.averageSpeedSeconds ?? null)}
                    </div>
                  </TableHead>
                  <TableHead>
                    <div>Qualified</div>
                    <div className="text-xs font-normal text-muted-foreground">
                      {percent(metrics?.qualifiedCount ?? 0, metrics?.leadCount ?? 0)} from lead
                    </div>
                  </TableHead>
                  <TableHead>
                    <div>Converted</div>
                    <div className="text-xs font-normal text-muted-foreground">
                      {percent(metrics?.convertedCount ?? 0, metrics?.qualifiedCount ?? 0)} from qualified
                    </div>
                  </TableHead>
                  <TableHead>
                    <div>Sold</div>
                    <div className="text-xs font-normal text-muted-foreground">
                      {percent(metrics?.soldCount ?? 0, metrics?.convertedCount ?? 0)} from converted
                    </div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="align-top">
                      <Link className="font-medium text-primary hover:underline" href={`/customers/${row.id}`}>
                        {row.name}
                      </Link>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {[row.city, row.zip].filter(Boolean).join(" · ") || "No location"}
                      </div>
                      <div className="text-xs text-muted-foreground">Created {formatDateTime(row.createdAt)}</div>
                    </TableCell>
                    <TableCell className="align-top">
                      <StageCell at={row.pipelineLeadAt} />
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge variant="outline">{row.pipelineLeadSource || "Unknown source"}</Badge>
                        <Badge variant="outline" className={speedClass(row.speedSeconds)}>
                          {formatSpeed(row.speedSeconds)}
                        </Badge>
                        {row.pipelineStage === "DISQUALIFIED" ? (
                          <Badge variant="destructive">SMS spam</Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="align-top"><StageCell at={row.pipelineQualifiedAt} /></TableCell>
                    <TableCell className="align-top"><StageCell at={row.pipelineConvertedAt} /></TableCell>
                    <TableCell className="align-top"><StageCell at={row.pipelineSoldAt} /></TableCell>
                  </TableRow>
                ))}
                {!data.rows.length ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-28 text-center text-muted-foreground">
                      No customers match these pipeline filters.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>
              {data.total === 0 ? "0 customers" : `Showing ${(data.page - 1) * data.pageSize + 1}–${Math.min(data.page * data.pageSize, data.total)} of ${data.total}`}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)}>
                Previous
              </Button>
              <span>Page {data.page} of {totalPages}</span>
              <Button variant="outline" size="sm" disabled={data.page >= totalPages} onClick={() => setPage(data.page + 1)}>
                Next
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </ContentArea>
  );
}
