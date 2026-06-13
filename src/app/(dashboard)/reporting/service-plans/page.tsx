"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { DueForBillingCard } from "@/components/maintenance-plans/DueForBillingCard";
import { PlanSummaryCard } from "@/components/maintenance-plans/PlanSummaryCard";
import { RecurringRevenueCard } from "@/components/maintenance-plans/RecurringRevenueCard";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  enrollmentStatusesToDisplay,
  formatCurrency,
  type BillingRowDisplay,
} from "@/lib/maintenance-plans/format";
import type { DashboardDTO } from "@/lib/maintenance-plans/types";

export default function ReportingServicePlansPage() {
  const [dashboard, setDashboard] = useState<DashboardDTO | null>(null);
  const [billingRows, setBillingRows] = useState<BillingRowDisplay[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/maintenance-plans/dashboard"),
      fetch("/api/maintenance-plans/billing"),
    ])
      .then(async ([dashRes, billingRes]) => {
        if (dashRes.ok) setDashboard(await dashRes.json());
        if (billingRes.ok) {
          const data = await billingRes.json();
          setBillingRows(data.billing ?? []);
        }
      })
      .catch(() => toast.error("Failed to load service plan stats"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <ContentArea className="max-w-[1400px]">
      <PageHeader
        breadcrumb={["Reporting", "Service plans"]}
        title="Service plans"
        actions={
          <Link href="/maintenance-plans" className="text-sm text-primary hover:underline">
            Manage plans
          </Link>
        }
      />

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading stats...</p>
      ) : dashboard ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <PlanSummaryCard
            totalPlans={dashboard.summary.totalEnrollments}
            revenueAllTime={formatCurrency(dashboard.summary.revenueAllTime)}
            statuses={enrollmentStatusesToDisplay(dashboard.summary.statuses)}
          />
          <RecurringRevenueCard items={dashboard.recurringRevenue} />

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                <span className="text-muted-foreground">Unscheduled visits:</span>{" "}
                {dashboard.unscheduledVisitCount}
              </p>
              <p>
                <span className="text-muted-foreground">Due for billing:</span>{" "}
                {dashboard.dueBillingCount}
              </p>
              <p>
                <span className="text-muted-foreground">Active templates:</span>{" "}
                {dashboard.templates.length}
              </p>
              <p>
                <span className="text-muted-foreground">Revenue this month:</span>{" "}
                {formatCurrency(dashboard.revenueCollectedThisMonth)}
              </p>
            </CardContent>
          </Card>

          <div className="lg:col-span-2">
            <DueForBillingCard rows={billingRows} />
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Unable to load dashboard data.</p>
      )}
    </ContentArea>
  );
}
