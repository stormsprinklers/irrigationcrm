"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/maintenance-plans/format";
import type { CustomerSummary } from "@/lib/customers/summary";

type Props = {
  customerId: string;
};

export function CustomerSummaryCard({ customerId }: Props) {
  const [summary, setSummary] = useState<CustomerSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/customers/${customerId}/summary`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setSummary)
      .finally(() => setLoading(false));
  }, [customerId]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          {loading || !summary
            ? "Summary"
            : summary.lifetimeValue > 0
              ? "Customer summary"
              : "Contact summary"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading summary...</p>
        ) : (
          <>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Lifetime value
              </p>
              <p className="mt-1 text-3xl font-semibold tracking-tight">
                {summary ? formatCurrency(summary.lifetimeValue) : "—"}
              </p>
              {summary && summary.lifetimeValue <= 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  No paid work yet. This person is listed under Contacts until they have lifetime value.
                </p>
              ) : null}
            </div>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Last visit
                </dt>
                <dd className="mt-1 text-lg font-semibold">
                  {summary?.lastVisitAt
                    ? format(new Date(summary.lastVisitAt), "MMM d, yyyy")
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Customer since
                </dt>
                <dd className="mt-1 text-lg font-semibold">
                  {summary?.createdAt
                    ? format(new Date(summary.createdAt), "MMM d, yyyy")
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Outstanding balance
                </dt>
                <dd
                  className={`mt-1 text-lg font-semibold ${
                    (summary?.outstandingBalance ?? 0) > 0 ? "text-destructive" : ""
                  }`}
                >
                  {summary ? formatCurrency(summary.outstandingBalance) : "—"}
                </dd>
              </div>
            </dl>
          </>
        )}
      </CardContent>
    </Card>
  );
}
