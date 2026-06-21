"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
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

type CampaignDetail = {
  id: string;
  name: string;
  channel: string;
  status: string;
  subject: string | null;
  bodyText: string;
  statsJson: { sent?: number; delivered?: number; failed?: number; pending?: number } | null;
  list: { name: string } | null;
  recipients: Array<{
    id: string;
    email: string | null;
    phone: string | null;
    status: string;
    error: string | null;
    sentAt: string | null;
  }>;
};

export default function CampaignDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  function load() {
    setLoading(true);
    fetch(`/api/campaigns/${id}`)
      .then((r) => r.json())
      .then((data) => setCampaign(data))
      .catch(() => toast.error("Failed to load campaign"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function sendCampaign() {
    setSending(true);
    try {
      const res = await fetch(`/api/campaigns/${id}/send`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Send failed");
      toast.success("Campaign sent");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  if (loading || !campaign) {
    return (
      <ContentArea>
        <PageHeader breadcrumb={["Campaigns"]} title="Campaign" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </ContentArea>
    );
  }

  const stats = campaign.statsJson ?? {};

  return (
    <ContentArea>
      <PageHeader
        breadcrumb={["Campaigns", campaign.name]}
        title={campaign.name}
        actions={
          campaign.status !== "COMPLETED" && campaign.status !== "SENDING" ? (
            <Button size="sm" onClick={sendCampaign} disabled={sending}>
              {sending ? "Sending..." : "Send now"}
            </Button>
          ) : undefined
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Sent", value: stats.sent ?? 0 },
          { label: "Delivered", value: stats.delivered ?? 0 },
          { label: "Failed", value: stats.failed ?? 0 },
          { label: "Pending", value: stats.pending ?? 0 },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-border bg-white p-4">
            <p className="text-2xl font-semibold">{s.value}</p>
            <p className="text-sm text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="mb-6 rounded-lg border border-border bg-white p-4">
        <div className="flex flex-wrap gap-3 text-sm">
          <Badge>{campaign.channel}</Badge>
          <Badge variant="secondary">{campaign.status}</Badge>
          {campaign.list && <span>List: {campaign.list.name}</span>}
        </div>
        {campaign.channel === "EMAIL" && campaign.subject && (
          <p className="mt-2 text-sm">
            <span className="text-muted-foreground">Subject:</span> {campaign.subject}
          </p>
        )}
        <p className="mt-2 whitespace-pre-wrap text-sm">{campaign.bodyText}</p>
      </div>

      <div className="rounded-lg border border-border bg-white">
        <div className="border-b border-border px-4 py-3">
          <h3 className="font-medium">Recipients</h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Contact</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Sent</TableHead>
              <TableHead>Error</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {campaign.recipients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  Recipients are created when the campaign is sent.
                </TableCell>
              </TableRow>
            ) : (
              campaign.recipients.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.email ?? r.phone ?? "—"}</TableCell>
                  <TableCell>{r.status}</TableCell>
                  <TableCell>
                    {r.sentAt ? format(new Date(r.sentAt), "MMM d h:mm a") : "—"}
                  </TableCell>
                  <TableCell className="text-destructive">{r.error ?? ""}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="mt-4">
        <Button variant="outline" size="sm" asChild>
          <Link href="/campaigns">Back to campaigns</Link>
        </Button>
      </div>
    </ContentArea>
  );
}
