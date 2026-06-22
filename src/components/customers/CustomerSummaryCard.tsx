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

  const items = [
    {
      label: "Last visit",
      value: summary?.lastVisitAt
        ? format(new Date(summary.lastVisitAt), "MMM d, yyyy")
        : "—",
    },
    {
      label: "Customer since",
      value: summary?.createdAt
        ? format(new Date(summary.createdAt), "MMM d, yyyy")
        : "—",
    },
    {
      label: "Lifetime value",
      value: summary ? formatCurrency(summary.lifetimeValue) : "—",
    },
    {
      label: "Lifetime gross profit",
      value: summary ? formatCurrency(summary.lifetimeGrossProfit) : "—",
    },
    {
      label: "Outstanding balance",
      value: summary ? formatCurrency(summary.outstandingBalance) : "—",
      highlight: (summary?.outstandingBalance ?? 0) > 0,
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Customer summary</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading summary...</p>
        ) : (
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {items.map((item) => (
              <div key={item.label}>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {item.label}
                </dt>
                <dd
                  className={`mt-1 text-lg font-semibold ${
                    item.highlight ? "text-destructive" : ""
                  }`}
                >
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
