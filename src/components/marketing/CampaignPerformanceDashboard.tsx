"use client";

import type { CampaignPerformance } from "@/lib/marketing/campaign-performance";
import { MarketingMetricGrid } from "@/components/marketing/MarketingMetricGrid";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function fmtRate(value: number | null | undefined) {
  return value == null ? "—" : `${value}%`;
}

type Props = {
  performance: CampaignPerformance;
};

export function CampaignPerformanceDashboard({ performance }: Props) {
  const { enrolled, deliverability, emails, links, unsubscribes } = performance;
  const sms = performance.sms ?? [];

  return (
    <div className="mb-8 space-y-6">
      <MarketingMetricGrid
        comingSoon={false}
        columns={4}
        metrics={[
          {
            label: "People enrolled",
            value: enrolled.total,
            tooltip:
              "Unique people. An email and an SMS to the same customer count as one person.",
          },
          { label: "Active", value: enrolled.active },
          { label: "Completed", value: enrolled.completed },
          {
            label: "Unsubscribe rate",
            value: fmtRate(unsubscribes.rate),
            tooltip: `${unsubscribes.count} opt-outs or marketing unsubscribes among people this campaign reached.`,
          },
        ]}
      />

      <div>
        <h3 className="mb-3 text-sm font-medium">Deliverability</h3>
        <MarketingMetricGrid
          comingSoon={false}
          columns={7}
          metrics={[
            { label: "Sent", value: deliverability.sent, tooltip: "Messages sent (email and SMS count separately)." },
            { label: "Delivered", value: deliverability.delivered },
            { label: "Failed", value: deliverability.failed },
            { label: "Bounced", value: deliverability.bounced },
            { label: "Pending", value: deliverability.pending },
            { label: "Opted out", value: deliverability.optedOut },
            { label: "Delivery rate", value: fmtRate(deliverability.deliveryRate) },
          ]}
        />
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="border-b px-4 py-3">
          <h3 className="font-medium">Email performance</h3>
          <p className="text-xs text-muted-foreground">Opens depend on images loading in the recipient’s email app.</p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Sent</TableHead>
              <TableHead>Delivered</TableHead>
              <TableHead>Opened</TableHead>
              <TableHead>Open rate</TableHead>
              <TableHead>Clicked</TableHead>
              <TableHead>CTR</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {emails.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">
                  No email sends in this campaign yet.
                </TableCell>
              </TableRow>
            ) : (
              emails.map((row) => (
                <TableRow key={row.key}>
                  <TableCell className="max-w-sm truncate font-medium">{row.label}</TableCell>
                  <TableCell>{row.sent}</TableCell>
                  <TableCell>{row.delivered}</TableCell>
                  <TableCell>{row.opened}</TableCell>
                  <TableCell>{fmtRate(row.openRate)}</TableCell>
                  <TableCell>{row.clicked}</TableCell>
                  <TableCell>{fmtRate(row.ctr)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {sms.length > 0 ? (
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b px-4 py-3">
            <h3 className="font-medium">SMS sends</h3>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Message</TableHead>
                <TableHead>Sent</TableHead>
                <TableHead>Delivered</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sms.map((row) => (
                <TableRow key={row.key}>
                  <TableCell className="max-w-sm truncate font-medium">{row.label}</TableCell>
                  <TableCell>{row.sent}</TableCell>
                  <TableCell>{row.delivered}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      <div className="rounded-lg border border-border bg-card">
        <div className="border-b px-4 py-3">
          <h3 className="font-medium">Link click-through rates</h3>
          <p className="text-xs text-muted-foreground">
            Overall CTR {fmtRate(performance.overallCtr)}. Links in the email body are wrapped with a
            tracking URL at send time. SMS links are not tracked.
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Link</TableHead>
              <TableHead>Clicks</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {links.length === 0 ? (
              <TableRow>
                <TableCell colSpan={2} className="text-muted-foreground">
                  No tracked link clicks yet.
                </TableCell>
              </TableRow>
            ) : (
              links.map((link) => (
                <TableRow key={link.url}>
                  <TableCell className="max-w-xl truncate font-mono text-xs">{link.url}</TableCell>
                  <TableCell>{link.clicks}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
