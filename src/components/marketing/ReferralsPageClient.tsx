"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { CircleHelp, Loader2, RefreshCw } from "lucide-react";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ReferralDashboardMetrics, ReferralPipelineRow, ReferralRewardQueueRow } from "@/lib/referrals/dashboard";
import {
  type ReportRangeInput,
  resolveReportRange,
} from "@/lib/reporting/date-range";

function HelpTip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex shrink-0 text-muted-foreground/80 hover:text-foreground"
          aria-label={label}
        >
          <CircleHelp className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        {children}
      </TooltipContent>
    </Tooltip>
  );
}

function LabelWithTip({
  htmlFor,
  tip,
  children,
}: {
  htmlFor?: string;
  tip: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="mb-1 flex items-center gap-1.5 text-sm font-medium">
      <span>{children}</span>
      <HelpTip label={`About ${typeof children === "string" ? children : "this field"}`}>{tip}</HelpTip>
    </label>
  );
}

function ColumnTip({ tip, children }: { tip: string; children: React.ReactNode }) {
  return (
    <th className="px-3 py-2 font-medium">
      <span className="inline-flex items-center gap-1">
        {children}
        <HelpTip label={`About ${typeof children === "string" ? children : "this column"}`}>{tip}</HelpTip>
      </span>
    </th>
  );
}

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
    {
      label: "Referral revenue",
      value: formatCurrency(metrics.referralRevenueCents),
      tooltip:
        "Paid invoice payments from referred customers in this range (deposit invoices excluded).",
    },
    {
      label: "Booking rate",
      value: formatPercent(metrics.bookingRate),
      tooltip:
        "Share of submissions that reached booked or later (estimate approved, paid, or rewarded).",
    },
    {
      label: "Conversion rate",
      value: formatPercent(metrics.conversionRate),
      tooltip: "Share of submissions that reached paid or rewarded status.",
    },
    {
      label: "Average ticket",
      value: formatCurrency(metrics.averageTicketCents),
      tooltip: "Referral revenue divided by paid/rewarded submissions in this range.",
    },
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
    <TooltipProvider delayDuration={250}>
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
                    <span className="inline-flex items-center gap-1.5">
                      Program enabled
                      <HelpTip label="About Program enabled">
                        Turns the referral program on for the customer portal and public referral links.
                        Rewards only process while this is enabled.
                      </HelpTip>
                    </span>
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={settings.autoEnrollCustomers}
                      onCheckedChange={(value) =>
                        setSettings({ ...settings, autoEnrollCustomers: value === true })
                      }
                    />
                    <span className="inline-flex items-center gap-1.5">
                      Auto-enroll active customers
                      <HelpTip label="About Auto-enroll active customers">
                        Automatically gives active customers a referral membership and link so they can
                        share without staff enrolling them manually.
                      </HelpTip>
                    </span>
                  </label>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <LabelWithTip
                      htmlFor="install-reward"
                      tip="Cash reward paid to the referrer when the referred job is install division and qualifies for payout."
                    >
                      Install reward ($)
                    </LabelWithTip>
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
                    <LabelWithTip
                      htmlFor="service-reward"
                      tip="Cash reward paid to the referrer when the referred job is service division (or when division is unset)."
                    >
                      Service reward ($)
                    </LabelWithTip>
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
                  <LabelWithTip
                    htmlFor="headline"
                    tip="Title shown at the top of the public referral form customers send to friends."
                  >
                    Public form headline
                  </LabelWithTip>
                  <Input id="headline" value={headline} onChange={(e) => setHeadline(e.target.value)} />
                </div>
                <div>
                  <LabelWithTip
                    htmlFor="terms"
                    tip="Program rules displayed on the referral form (eligibility, payout timing, exclusions, etc.)."
                  >
                    Terms shown on referral form
                  </LabelWithTip>
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
                  <div className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                    <span>
                      Stripe Connect:{" "}
                      {settings.stripeConnect.connected ? (
                        <span className="text-green-700">Ready ({settings.stripeConnect.accountId})</span>
                      ) : (
                        <span>Not verified</span>
                      )}
                    </span>
                    <HelpTip label="About Stripe Connect">
                      Referral cash rewards are paid through Stripe Connect. Verify the company Connect
                      account before payouts can succeed.
                    </HelpTip>
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
            <h2 className="inline-flex items-center gap-1.5 text-lg font-medium">
              Metrics
              <HelpTip label="About Metrics">
                Performance for referral submissions created in the selected date range.
              </HelpTip>
            </h2>
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
                      <ColumnTip tip="Existing customer who submitted the referral.">Referrer</ColumnTip>
                      <ColumnTip tip="Person or lead that was referred in.">Referred</ColumnTip>
                      <ColumnTip tip="Lifecycle stage: submitted → booked → estimate approved → paid → rewarded (or disqualified/expired).">
                        Status
                      </ColumnTip>
                      <ColumnTip tip="Install vs service job type used to choose the reward amount.">
                        Division
                      </ColumnTip>
                      <ColumnTip tip="Revenue attributed to this referral when available.">Revenue</ColumnTip>
                      <ColumnTip tip="Reward amount and payout status for the referrer.">Reward</ColumnTip>
                      <ColumnTip tip="When the referral form was submitted.">Submitted</ColumnTip>
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
                      <ColumnTip tip="Customer due to receive the cash reward.">Referrer</ColumnTip>
                      <ColumnTip tip="Referred customer that triggered this reward.">Referred</ColumnTip>
                      <ColumnTip tip="Payout amount based on install or service reward settings.">Amount</ColumnTip>
                      <ColumnTip tip="Pending onboarding (Stripe setup), pending payout, transferred, or failed.">
                        Status
                      </ColumnTip>
                      <ColumnTip tip="Stripe or payout failure details when a transfer did not complete.">
                        Error
                      </ColumnTip>
                      <th className="px-3 py-2 font-medium">
                        <span className="inline-flex items-center gap-1">
                          Actions
                          <HelpTip label="About Actions">
                            Retry resubmits a failed or stuck pending payout through Stripe Connect.
                          </HelpTip>
                        </span>
                      </th>
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
    </TooltipProvider>
  );
}
