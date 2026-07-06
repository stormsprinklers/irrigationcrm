"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  MarketingEmptyTable,
  MarketingMetricGrid,
  MarketingSectionCard,
} from "@/components/marketing/MarketingMetricGrid";
import { ReportDateRangeControl } from "@/components/reporting/ReportDateRangeControl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { ReferralDashboardMetrics, ReferralPipelineRow, ReferralRewardQueueRow } from "@/lib/referrals/dashboard";
import {
  type ReportRangeInput,
  resolveReportRange,
} from "@/lib/reporting/date-range";

type Settings = {
  enabled: boolean;
  installRewardCents: number;
  serviceRewardCents: number;
  autoEnrollCustomers: boolean;
  headline: string | null;
  terms: string | null;
  stripeConnect: { connected: boolean; accountId: string | null };
};

type DashboardResponse = {
  range: { preset: string; label: string };
  metrics: ReferralDashboardMetrics;
  pipeline: ReferralPipelineRow[];
  rewardsQueue: ReferralRewardQueueRow[];
};

function formatCurrency(cents: number | null | undefined) {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatPercent(rate: number | null | undefined) {
  if (rate == null) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}

function metricsToCards(metrics: ReferralDashboardMetrics) {
  return [
    { label: "Referral revenue", value: formatCurrency(metrics.referralRevenueCents) },
    { label: "Booking rate", value: formatPercent(metrics.bookingRate) },
    { label: "Conversion rate", value: formatPercent(metrics.conversionRate) },
    { label: "Average ticket", value: formatCurrency(metrics.averageTicketCents) },
  ];
}

function statusBadge(status: string) {
  const variant =
    status === "REWARDED" || status === "TRANSFERRED"
      ? "default"
      : status === "FAILED" || status === "DISQUALIFIED"
        ? "destructive"
        : "secondary";
  return <Badge variant={variant}>{status.replace(/_/g, " ")}</Badge>;
}

export function ReferralsPageClient() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [range, setRange] = useState<ReportRangeInput>({ preset: "ytd" });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connectingStripe, setConnectingStripe] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const [installReward, setInstallReward] = useState("");
  const [serviceReward, setServiceReward] = useState("");
  const [headline, setHeadline] = useState("");
  const [terms, setTerms] = useState("");

  const rangeLabel = resolveReportRange(range).label;

  const loadDashboard = useCallback(async (nextRange: ReportRangeInput) => {
    const params = new URLSearchParams();
    if (nextRange.preset === "custom") {
      params.set("range", "custom");
      params.set("start", nextRange.start);
      params.set("end", nextRange.end);
    } else {
      params.set("range", nextRange.preset);
    }
    const res = await fetch(`/api/marketing/referrals/dashboard?${params}`);
    if (!res.ok) throw new Error("Failed to load dashboard");
    return res.json() as Promise<DashboardResponse>;
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsRes, dash] = await Promise.all([
        fetch("/api/marketing/referrals/settings"),
        loadDashboard(range),
      ]);
      if (!settingsRes.ok) throw new Error("Failed to load settings");
      const settingsData = (await settingsRes.json()) as Settings;
      setSettings(settingsData);
      setInstallReward(String(settingsData.installRewardCents / 100));
      setServiceReward(String(settingsData.serviceRewardCents / 100));
      setHeadline(settingsData.headline ?? "");
      setTerms(settingsData.terms ?? "");
      setDashboard(dash);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load referrals");
    } finally {
      setLoading(false);
    }
  }, [loadDashboard, range]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function saveSettings() {
    setSaving(true);
    try {
      const res = await fetch("/api/marketing/referrals/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: settings?.enabled,
          autoEnrollCustomers: settings?.autoEnrollCustomers,
          installRewardDollars: Number(installReward),
          serviceRewardDollars: Number(serviceReward),
          headline,
          terms,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Save failed");
      }
      const data = (await res.json()) as Settings;
      setSettings(data);
      toast.success("Referral settings saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function connectStripe() {
    setConnectingStripe(true);
    try {
      const res = await fetch("/api/marketing/referrals/connect", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Connect failed");
      toast.success("Stripe Connect verified");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Connect failed");
    } finally {
      setConnectingStripe(false);
    }
  }

  async function retryPayout(rewardId: string) {
    setRetryingId(rewardId);
    try {
      const res = await fetch(`/api/referrals/retry-payout/${rewardId}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Retry failed");
      toast.success("Payout retry submitted");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Retry failed");
    } finally {
      setRetryingId(null);
    }
  }

  return (
    <ContentArea>
      <PageHeader
        breadcrumb={["Marketing", "Referrals"]}
        title="Referrals"
        subtitle="Customer referral program with division-based rewards and Stripe Connect payouts."
        actions={
          <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      <div className="space-y-6">
        <MarketingSectionCard title="Program settings" description="Enable rewards and configure payout amounts.">
          {settings ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={settings.enabled}
                    onCheckedChange={(value) => setSettings({ ...settings, enabled: value === true })}
                  />
                  Program enabled
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={settings.autoEnrollCustomers}
                    onCheckedChange={(value) =>
                      setSettings({ ...settings, autoEnrollCustomers: value === true })
                    }
                  />
                  Auto-enroll active customers
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="install-reward" className="mb-1 block text-sm font-medium">
                    Install reward ($)
                  </label>
                  <Input
                    id="install-reward"
                    type="number"
                    min={0}
                    step={1}
                    value={installReward}
                    onChange={(e) => setInstallReward(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="service-reward" className="mb-1 block text-sm font-medium">
                    Service reward ($)
                  </label>
                  <Input
                    id="service-reward"
                    type="number"
                    min={0}
                    step={1}
                    value={serviceReward}
                    onChange={(e) => setServiceReward(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="headline" className="mb-1 block text-sm font-medium">
                  Public form headline
                </label>
                <Input id="headline" value={headline} onChange={(e) => setHeadline(e.target.value)} />
              </div>
              <div>
                <label htmlFor="terms" className="mb-1 block text-sm font-medium">
                  Terms shown on referral form
                </label>
                <textarea
                  id="terms"
                  rows={3}
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={() => void saveSettings()} disabled={saving}>
                  {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                  Save settings
                </Button>
                <div className="text-sm text-muted-foreground">
                  Stripe Connect:{" "}
                  {settings.stripeConnect.connected ? (
                    <span className="text-green-700">Ready ({settings.stripeConnect.accountId})</span>
                  ) : (
                    <span>Not verified</span>
                  )}
                </div>
                {!settings.stripeConnect.connected ? (
                  <Button variant="outline" size="sm" onClick={() => void connectStripe()} disabled={connectingStripe}>
                    Verify Stripe Connect
                  </Button>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Loading settings...</p>
          )}
        </MarketingSectionCard>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium">Metrics</h2>
          <ReportDateRangeControl
            value={range}
            onChange={(next) => {
              setRange(next);
              void loadDashboard(next).then(setDashboard).catch(() => toast.error("Failed to load range"));
            }}
            label={rangeLabel}
          />
        </div>

        {dashboard ? (
          <MarketingMetricGrid metrics={metricsToCards(dashboard.metrics)} comingSoon={false} />
        ) : null}

        <MarketingSectionCard title="Pipeline" description="All referral submissions in the selected range.">
          {dashboard && dashboard.pipeline.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Referrer</th>
                    <th className="px-3 py-2 font-medium">Referred</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Division</th>
                    <th className="px-3 py-2 font-medium">Revenue</th>
                    <th className="px-3 py-2 font-medium">Reward</th>
                    <th className="px-3 py-2 font-medium">Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.pipeline.map((row) => (
                    <tr key={row.id} className="border-b">
                      <td className="px-3 py-2">{row.referrerName}</td>
                      <td className="px-3 py-2">
                        <div>{row.referredName}</div>
                        {row.referredContact ? (
                          <div className="text-xs text-muted-foreground">{row.referredContact}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">{statusBadge(row.status)}</td>
                      <td className="px-3 py-2">{row.division ?? "—"}</td>
                      <td className="px-3 py-2">{formatCurrency(row.revenueCents)}</td>
                      <td className="px-3 py-2">
                        {formatCurrency(row.rewardCents)}
                        {row.rewardStatus ? (
                          <div className="text-xs text-muted-foreground">{row.rewardStatus}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">{format(new Date(row.createdAt), "MMM d, yyyy")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <MarketingEmptyTable
              columns={["Referrer", "Referred", "Status", "Division", "Revenue", "Reward", "Submitted"]}
              message="No referral submissions in this range yet."
            />
          )}
        </MarketingSectionCard>

        <MarketingSectionCard title="Rewards queue" description="Pending onboarding, payouts, and failed transfers.">
          {dashboard && dashboard.rewardsQueue.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Referrer</th>
                    <th className="px-3 py-2 font-medium">Referred</th>
                    <th className="px-3 py-2 font-medium">Amount</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Error</th>
                    <th className="px-3 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {dashboard.rewardsQueue.map((row) => (
                    <tr key={row.id} className="border-b">
                      <td className="px-3 py-2">{row.referrerName}</td>
                      <td className="px-3 py-2">{row.referredName}</td>
                      <td className="px-3 py-2">{formatCurrency(row.amountCents)}</td>
                      <td className="px-3 py-2">{statusBadge(row.status)}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{row.failureReason ?? "—"}</td>
                      <td className="px-3 py-2">
                        {row.status === "FAILED" || row.status === "PENDING_PAYOUT" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={retryingId === row.id}
                            onClick={() => void retryPayout(row.id)}
                          >
                            Retry
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <MarketingEmptyTable
              columns={["Referrer", "Referred", "Amount", "Status", "Error", ""]}
              message="No pending or failed rewards."
            />
          )}
        </MarketingSectionCard>
      </div>
    </ContentArea>
  );
}
