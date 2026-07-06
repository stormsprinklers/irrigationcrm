"use client";

import Link from "next/link";
import { format } from "date-fns";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

type ReviewLinkStats = {
  sent: number;
  clicked: number;
  totalClicks: number;
  rows: Array<{
    id: string;
    customerId: string | null;
    customerName: string | null;
    customerPhone: string | null;
    visitId: string | null;
    visitTitle: string | null;
    visitDate: string | null;
    sentAt: string;
    clickedAt: string | null;
    clickCount: number;
  }>;
};

export function ReviewLinkTrackingPanel() {
  const [stats, setStats] = useState<ReviewLinkStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/settings/notifications/review-links")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setStats(data))
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading review link activity…
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  const clickRate = stats.sent > 0 ? Math.round((stats.clicked / stats.sent) * 100) : 0;

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-4">
      <div>
        <p className="text-sm font-medium">Review link tracking</p>
        <p className="mt-1 text-xs text-muted-foreground">
          SMS and email review requests use a tracked redirect link (your CRM domain) so you can see
          who clicked through to Google.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Links sent</p>
          <p className="font-semibold tabular-nums">{stats.sent}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Customers clicked</p>
          <p className="font-semibold tabular-nums">
            {stats.clicked}
            {stats.sent > 0 ? (
              <span className="ml-1 text-xs font-normal text-muted-foreground">({clickRate}%)</span>
            ) : null}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Total clicks</p>
          <p className="font-semibold tabular-nums">{stats.totalClicks}</p>
        </div>
      </div>

      {stats.rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Customer</th>
                <th className="py-2 pr-3 font-medium">Visit</th>
                <th className="py-2 pr-3 font-medium">Sent</th>
                <th className="py-2 pr-3 font-medium">Clicked</th>
                <th className="py-2 font-medium">Clicks</th>
              </tr>
            </thead>
            <tbody>
              {stats.rows.map((row) => (
                <tr key={row.id} className="border-b border-border/60">
                  <td className="py-2 pr-3">
                    {row.customerId ? (
                      <Link href={`/customers/${row.customerId}`} className="font-medium underline">
                        {row.customerName ?? "Customer"}
                      </Link>
                    ) : (
                      <span>{row.customerName ?? "Unknown"}</span>
                    )}
                    {row.customerPhone ? (
                      <p className="text-xs text-muted-foreground">{row.customerPhone}</p>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3 text-muted-foreground">
                    {row.visitId ? (
                      <Link href={`/visits/${row.visitId}`} className="underline">
                        {row.visitTitle ?? "Visit"}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 pr-3 text-muted-foreground">
                    {format(new Date(row.sentAt), "MMM d, yyyy")}
                  </td>
                  <td className="py-2 pr-3 text-muted-foreground">
                    {row.clickedAt ? format(new Date(row.clickedAt), "MMM d, yyyy h:mm a") : "—"}
                  </td>
                  <td className="py-2 tabular-nums">{row.clickCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No review link clicks recorded yet.</p>
      )}
    </div>
  );
}
