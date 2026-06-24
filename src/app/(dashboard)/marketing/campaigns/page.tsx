"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Plus } from "lucide-react";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { MarketingMetricGrid } from "@/components/marketing/MarketingMetricGrid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

type CampaignRow = {
  id: string;
  name: string;
  type: string;
  channel: string;
  status: string;
  recipientCount: number;
  sentAt: string | null;
  createdAt: string;
  statsJson?: { opened?: number; clicked?: number; delivered?: number } | null;
  delivered?: number;
  opened?: number;
  clicked?: number;
  deliveryRate?: number;
  openRate?: number;
  clickRate?: number;
};

type InsightsData = {
  summary: {
    campaignCount: number;
    activeDrip: number;
    deliveryRate: number;
    openRate: number;
    clickRate: number;
  };
  campaigns: CampaignRow[];
};

export default function MarketingCampaignsPage() {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/marketing/insights")
      .then((r) => r.json())
      .then(setData)
      .catch(() => toast.error("Failed to load campaigns"))
      .finally(() => setLoading(false));
  }, []);

  const summary = data?.summary;
  const campaigns = data?.campaigns ?? [];

  return (
    <ContentArea>
      <PageHeader
        breadcrumb={["Marketing", "Campaigns"]}
        title="Campaigns"
        subtitle="Email blasts, SMS campaigns, drip sequences, and performance insights."
        actions={
          <Button size="sm" asChild>
            <Link href="/marketing/campaigns/new">
              <Plus className="mr-1 h-4 w-4" />
              New campaign
            </Link>
          </Button>
        }
      />

      <MarketingMetricGrid
        className="mb-8"
        columns={5}
        comingSoon={false}
        metrics={[
          { label: "Total campaigns", value: loading ? "—" : summary?.campaignCount ?? 0 },
          { label: "Active drips", value: loading ? "—" : summary?.activeDrip ?? 0 },
          { label: "Delivery rate", value: loading ? "—" : `${summary?.deliveryRate ?? 0}%` },
          { label: "Open rate", value: loading ? "—" : `${summary?.openRate ?? 0}%` },
          { label: "Click rate", value: loading ? "—" : `${summary?.clickRate ?? 0}%` },
        ]}
      />

      <div className="rounded-lg border border-border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
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
            ) : campaigns.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-muted-foreground">
                  No campaigns yet. Create your first marketing campaign.
                </TableCell>
              </TableRow>
            ) : (
              campaigns.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link
                      href={`/marketing/campaigns/${c.id}`}
                      className="font-medium hover:underline"
                    >
                      {c.name}
                    </Link>
                  </TableCell>
                  <TableCell>{c.type}</TableCell>
                  <TableCell>{c.channel}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        c.status === "COMPLETED" || c.status === "ACTIVE" ? "default" : "secondary"
                      }
                    >
                      {c.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{c.recipientCount}</TableCell>
                  <TableCell>{c.delivered ?? "—"}</TableCell>
                  <TableCell>{c.openRate != null ? `${c.openRate}%` : "—"}</TableCell>
                  <TableCell>{c.clickRate != null ? `${c.clickRate}%` : "—"}</TableCell>
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
