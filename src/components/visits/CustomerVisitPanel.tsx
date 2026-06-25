"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ChevronRight, Mail, MapPin, MessageSquare, Phone } from "lucide-react";
import { CustomerNameWithBadge } from "@/components/customers/CustomerNameWithBadge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { buildInboxCustomerUrl } from "@/lib/inbox/links";

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  doNotService?: boolean;
};

type HistoryData = {
  pastVisitCount: number;
  visits: Array<{
    id: string;
    title: string;
    startAt: string;
    status: string;
    assignedUserName: string | null;
  }>;
  estimatesWithoutVisit: Array<{
    id: string;
    status: string;
    total: string | number;
    createdAt: string;
  }>;
  estimatesLinkedToVisits: Array<{
    id: string;
    status: string;
    total: string | number;
    createdAt: string;
    visitId: string | null;
    visitTitle: string | null;
  }>;
};

function formatMoney(value: string | number) {
  const num = typeof value === "number" ? value : Number(value);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number.isFinite(num) ? num : 0
  );
}

type Props = {
  customer: Customer | null;
  visitId?: string;
  jobAddress?: string | null;
  mapsUrl?: string | null;
};

export function CustomerVisitPanel({ customer, visitId, jobAddress, mapsUrl }: Props) {
  const [tab, setTab] = useState<"contact" | "history">("contact");
  const [history, setHistory] = useState<HistoryData | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (!customer) return;
    setLoadingHistory(true);
    const qs = visitId ? `?excludeVisitId=${encodeURIComponent(visitId)}` : "";
    fetch(`/api/customers/${customer.id}/history${qs}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setHistory)
      .finally(() => setLoadingHistory(false));
  }, [customer, visitId]);

  if (!customer) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        No customer linked to this visit.
      </div>
    );
  }

  const linkParams = {
    customerId: customer.id,
    phone: customer.phone,
    email: customer.email,
    name: customer.name,
  };

  return (
    <div className="overflow-hidden rounded-lg border bg-white">
      <div className="flex border-b border-border">
        <button
          type="button"
          className={cn(
            "flex-1 px-4 py-2.5 text-sm font-medium transition-colors",
            tab === "contact"
              ? "border-b-2 border-primary text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
          onClick={() => setTab("contact")}
        >
          Contact
        </button>
        <button
          type="button"
          className={cn(
            "flex-1 px-4 py-2.5 text-sm font-medium transition-colors",
            tab === "history"
              ? "border-b-2 border-primary text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
          onClick={() => setTab("history")}
        >
          Customer history
          {history !== null ? (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
              ({history.pastVisitCount} past visit{history.pastVisitCount === 1 ? "" : "s"})
            </span>
          ) : null}
        </button>
      </div>

      {tab === "contact" ? (
        <div className="space-y-3 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/customers/${customer.id}`}
              className="mr-1 font-medium text-primary hover:underline"
            >
              <CustomerNameWithBadge
                name={customer.name}
                doNotService={customer.doNotService}
                nameClassName="font-medium"
              />
            </Link>
            {customer.phone ? (
              <>
                <Button variant="outline" size="sm" asChild>
                  <Link href={buildInboxCustomerUrl("voice", linkParams)}>
                    <Phone className="h-4 w-4" />
                    Call
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link href={buildInboxCustomerUrl("sms", linkParams)}>
                    <MessageSquare className="h-4 w-4" />
                    Text
                  </Link>
                </Button>
              </>
            ) : null}
            {customer.email ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={buildInboxCustomerUrl("email", linkParams)}>
                  <Mail className="h-4 w-4" />
                  Email
                </Link>
              </Button>
            ) : null}
          </div>
          {jobAddress ? (
            <div className="flex items-start gap-2 text-sm text-muted-foreground">
              <p className="min-w-0 flex-1">{jobAddress}</p>
              {mapsUrl ? (
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  asChild
                  title="Navigate with Google Maps"
                >
                  <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
                    <MapPin className="h-4 w-4" />
                    <span className="sr-only">Open in Google Maps</span>
                  </a>
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="max-h-80 overflow-y-auto p-3">
          {loadingHistory ? (
            <p className="text-sm text-muted-foreground">Loading history...</p>
          ) : !history ? (
            <p className="text-sm text-muted-foreground">Could not load customer history.</p>
          ) : (
            <div className="space-y-4">
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Past visits
                </h3>
                {history.visits.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No other visits for this customer.</p>
                ) : (
                  <ul className="divide-y divide-border rounded-md border">
                    {history.visits.map((visit) => (
                      <li key={visit.id}>
                        <Link
                          href={`/visits/${visit.id}`}
                          className="flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-muted/50"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium">{visit.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(visit.startAt), "MMM d, yyyy")} ·{" "}
                              {visit.assignedUserName ?? "Unassigned"} ·{" "}
                              {visit.status.replace(/_/g, " ")}
                            </p>
                          </div>
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {(history.estimatesLinkedToVisits.length > 0 ||
                history.estimatesWithoutVisit.length > 0) && (
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Estimates
                  </h3>
                  <ul className="divide-y divide-border rounded-md border">
                    {history.estimatesLinkedToVisits.map((estimate) => (
                      <li key={estimate.id}>
                        <Link
                          href={`/customers/estimates/${estimate.id}`}
                          className="flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-muted/50"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium">
                              {formatMoney(estimate.total)} · {estimate.status}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Linked to visit: {estimate.visitTitle ?? estimate.visitId}
                            </p>
                          </div>
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </Link>
                      </li>
                    ))}
                    {history.estimatesWithoutVisit.map((estimate) => (
                      <li key={estimate.id}>
                        <Link
                          href={`/customers/estimates/${estimate.id}`}
                          className="flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-muted/50"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium">
                              {formatMoney(estimate.total)} · {estimate.status}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(estimate.createdAt), "MMM d, yyyy")} · Not linked to
                              a visit
                            </p>
                          </div>
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
