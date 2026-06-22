"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Plus } from "lucide-react";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
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
};

export default function MarketingCampaignsPage() {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/marketing/campaigns")
      .then((r) => r.json())
      .then((data) => setCampaigns(data.campaigns ?? []))
      .catch(() => toast.error("Failed to load campaigns"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <ContentArea>
      <PageHeader
        breadcrumb={["Marketing", "Campaigns"]}
        title="Campaigns"
        subtitle="Email blasts, SMS campaigns, and drip sequences."
        actions={
          <Button size="sm" asChild>
            <Link href="/marketing/campaigns/new">
              <Plus className="mr-1 h-4 w-4" />
              New campaign
            </Link>
          </Button>
        }
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
              <TableHead>Opens</TableHead>
              <TableHead>Sent</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : campaigns.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-muted-foreground">
                  No campaigns yet. Create your first marketing campaign.
                </TableCell>
              </TableRow>
            ) : (
              campaigns.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`/marketing/campaigns/${c.id}`} className="font-medium hover:underline">
                      {c.name}
                    </Link>
                  </TableCell>
                  <TableCell>{c.type}</TableCell>
                  <TableCell>{c.channel}</TableCell>
                  <TableCell>
                    <Badge variant={c.status === "COMPLETED" || c.status === "ACTIVE" ? "default" : "secondary"}>
                      {c.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{c.recipientCount}</TableCell>
                  <TableCell>{c.statsJson?.opened ?? "—"}</TableCell>
                  <TableCell>
                    {c.sentAt ? format(new Date(c.sentAt), "MMM d, yyyy") : "—"}
                  </TableCell>
                  <TableCell>{format(new Date(c.createdAt), "MMM d, yyyy")}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </ContentArea>
  );
}
