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
  type: string;
  channel: string;
  status: string;
  subject: string | null;
  bodyText: string;
  bodyHtml: string | null;
  statsJson: {
    sent?: number;
    delivered?: number;
    failed?: number;
    pending?: number;
    opened?: number;
    clicked?: number;
    total?: number;
  } | null;
  list: { name: string } | null;
  steps: Array<{ sortOrder: number; channel: string; subject: string | null; delayDays: number }>;
  enrollments: Array<{ status: string; currentStepIndex: number }>;
  recipients: Array<{
    id: string;
    email: string | null;
    phone: string | null;
    status: string;
    error: string | null;
    sentAt: string | null;
    deliveredAt: string | null;
    openedAt: string | null;
    clickedAt: string | null;
    clickCount: number;
  }>;
};

export default function MarketingCampaignDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  function load() {
    setLoading(true);
    fetch(`/api/marketing/campaigns/${id}`)
      .then((r) => r.json())
      .then((data) => setCampaign(data))
      .catch(() => toast.error("Failed to load campaign"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function runAction(action: "send" | "activate") {
    setActing(true);
    try {
      const endpoint =
        action === "activate"
          ? `/api/marketing/campaigns/${id}/activate`
          : `/api/marketing/campaigns/${id}/send`;
      const res = await fetch(endpoint, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Action failed");
      toast.success(action === "activate" ? "Drip activated" : "Campaign sent");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setActing(false);
    }
  }

  if (loading || !campaign) {
    return (
      <ContentArea>
        <PageHeader breadcrumb={["Marketing", "Campaigns"]} title="Campaign" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </ContentArea>
    );
  }

  const stats = campaign.statsJson ?? {};
  const delivered = stats.delivered ?? 0;
  const opened = stats.opened ?? 0;
  const clicked = stats.clicked ?? 0;

  return (
    <ContentArea>
      <PageHeader
        breadcrumb={["Marketing", "Campaigns", campaign.name]}
        title={campaign.name}
        actions={
          campaign.status !== "COMPLETED" && campaign.status !== "SENDING" ? (
            campaign.type === "DRIP" ? (
              campaign.status !== "ACTIVE" ? (
                <Button size="sm" onClick={() => runAction("activate")} disabled={acting}>
                  {acting ? "Activating..." : "Activate drip"}
                </Button>
              ) : null
            ) : (
              <Button size="sm" onClick={() => runAction("send")} disabled={acting}>
                {acting ? "Sending..." : "Send now"}
              </Button>
            )
          ) : undefined
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Sent", value: stats.sent ?? 0 },
          { label: "Delivered", value: delivered },
          { label: "Opened", value: opened },
          { label: "Clicked", value: clicked },
          { label: "Failed", value: stats.failed ?? 0 },
          { label: "Pending", value: stats.pending ?? 0 },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-border bg-white p-4">
            <p className="text-2xl font-semibold">{s.value}</p>
            <p className="text-sm text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {delivered > 0 && campaign.channel === "EMAIL" && (
        <div className="mb-6 grid grid-cols-3 gap-4">
          {[
            { label: "Delivery rate", value: `${Math.round((delivered / (stats.total ?? delivered)) * 100)}%` },
            { label: "Open rate", value: `${Math.round((opened / delivered) * 100)}%` },
            { label: "Click rate", value: `${Math.round((clicked / delivered) * 100)}%` },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border bg-muted/20 p-4">
              <p className="text-xl font-semibold">{s.value}</p>
              <p className="text-sm text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mb-6 rounded-lg border border-border bg-white p-4">
        <div className="flex flex-wrap gap-3 text-sm">
          <Badge>{campaign.type}</Badge>
          <Badge>{campaign.channel}</Badge>
          <Badge variant="secondary">{campaign.status}</Badge>
          {campaign.list && <span>List: {campaign.list.name}</span>}
          {campaign.type === "DRIP" && (
            <span>
              Enrollments: {campaign.enrollments.length} active
            </span>
          )}
        </div>
        {campaign.channel === "EMAIL" && campaign.subject && (
          <p className="mt-2 text-sm">
            <span className="text-muted-foreground">Subject:</span> {campaign.subject}
          </p>
        )}
        {campaign.bodyHtml ? (
          <div className="mt-4 overflow-hidden rounded border">
            <iframe title="Preview" className="h-64 w-full" srcDoc={campaign.bodyHtml} />
          </div>
        ) : (
          <p className="mt-2 whitespace-pre-wrap text-sm">{campaign.bodyText}</p>
        )}
      </div>

      {campaign.type === "DRIP" && campaign.steps.length > 0 && (
        <div className="mb-6 rounded-lg border bg-white p-4">
          <h3 className="mb-3 font-medium">Drip sequence</h3>
          <ol className="space-y-2 text-sm">
            {campaign.steps.map((step, i) => (
              <li key={i}>
                Step {i + 1}: {step.channel}
                {step.subject ? ` — ${step.subject}` : ""} (delay {step.delayDays}d)
              </li>
            ))}
          </ol>
        </div>
      )}

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
              <TableHead>Opened</TableHead>
              <TableHead>Clicks</TableHead>
              <TableHead>Error</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {campaign.recipients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
                  Recipients appear when the campaign is sent or drip is activated.
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
                  <TableCell>
                    {r.openedAt ? format(new Date(r.openedAt), "MMM d h:mm a") : "—"}
                  </TableCell>
                  <TableCell>{r.clickCount > 0 ? r.clickCount : "—"}</TableCell>
                  <TableCell className="text-destructive">{r.error ?? ""}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="mt-4">
        <Button variant="outline" size="sm" asChild>
          <Link href="/marketing/campaigns">Back to campaigns</Link>
        </Button>
      </div>
    </ContentArea>
  );
}
