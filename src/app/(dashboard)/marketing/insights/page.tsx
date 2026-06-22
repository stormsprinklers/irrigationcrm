"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

type InsightsData = {
  summary: {
    campaignCount: number;
    activeDrip: number;
    deliveryRate: number;
    openRate: number;
    clickRate: number;
  };
  campaigns: Array<{
    id: string;
    name: string;
    type: string;
    channel: string;
    status: string;
    sentAt: string | null;
    recipientCount: number;
    delivered: number;
    opened: number;
    clicked: number;
    deliveryRate: number;
    openRate: number;
    clickRate: number;
  }>;
};

export default function MarketingInsightsPage() {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/marketing/insights")
      .then((r) => r.json())
      .then(setData)
      .catch(() => toast.error("Failed to load insights"))
      .finally(() => setLoading(false));
  }, []);

  const summary = data?.summary;

  return (
    <ContentArea>
      <PageHeader
        breadcrumb={["Marketing", "Insights"]}
        title="Campaign insights"
        subtitle="Delivery, open, and click performance across all campaigns."
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: "Campaigns", value: summary?.campaignCount ?? 0 },
          { label: "Active drips", value: summary?.activeDrip ?? 0 },
          { label: "Delivery rate", value: `${summary?.deliveryRate ?? 0}%` },
          { label: "Open rate", value: `${summary?.openRate ?? 0}%` },
          { label: "Click rate", value: `${summary?.clickRate ?? 0}%` },
        ].map((card) => (
          <div key={card.label} className="rounded-lg border bg-white p-4">
            <p className="text-2xl font-semibold">{loading ? "—" : card.value}</p>
            <p className="text-sm text-muted-foreground">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Campaign</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Recipients</TableHead>
              <TableHead>Delivered</TableHead>
              <TableHead>Open %</TableHead>
              <TableHead>Click %</TableHead>
              <TableHead>Sent</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : !data?.campaigns.length ? (
              <TableRow>
                <TableCell colSpan={9} className="text-muted-foreground">
                  No campaign data yet.
                </TableCell>
              </TableRow>
            ) : (
              data.campaigns.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`/marketing/campaigns/${c.id}`} className="font-medium hover:underline">
                      {c.name}
                    </Link>
                  </TableCell>
                  <TableCell>{c.type}</TableCell>
                  <TableCell>{c.channel}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{c.status}</Badge>
                  </TableCell>
                  <TableCell>{c.recipientCount}</TableCell>
                  <TableCell>{c.delivered}</TableCell>
                  <TableCell>{c.openRate}%</TableCell>
                  <TableCell>{c.clickRate}%</TableCell>
                  <TableCell>
                    {c.sentAt ? format(new Date(c.sentAt), "MMM d, yyyy") : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </ContentArea>
  );
}
