"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { HelpCircle, Plus, Settings, Smile } from "lucide-react";
import { toast } from "sonner";
import { DueForBillingCard } from "@/components/maintenance-plans/DueForBillingCard";
import { PlanSummaryCard } from "@/components/maintenance-plans/PlanSummaryCard";
import { RecurringRevenueCard } from "@/components/maintenance-plans/RecurringRevenueCard";
import { SmartIrrigationPanel } from "@/components/maintenance-plans/SmartIrrigationPanel";
import { UnscheduledVisitsCard } from "@/components/maintenance-plans/UnscheduledVisitsCard";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  enrollmentStatusesToDisplay,
  formatCurrency,
  type BillingRowDisplay,
} from "@/lib/maintenance-plans/format";
import type { DashboardDTO } from "@/lib/maintenance-plans/types";

export default function MaintenancePlansPage() {
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
          setBillingRows(
            (data.billing ?? []).map(
              (row: {
                id: string;
                enrollmentId: string;
                customer: string;
                phone: string | null;
                dueDate: string;
                status: string;
                amount: number;
              }) => ({
                id: row.id,
                enrollmentId: row.enrollmentId,
                customer: row.customer,
                phone: row.phone,
                dueDate: row.dueDate,
                status: row.status,
                amount: row.amount,
              })
            )
          );
        }
      })
      .catch(() => toast.error("Failed to load maintenance plans"))
      .finally(() => setLoading(false));
  }, []);

  const monthName = format(new Date(), "MMMM");
  const revenueCollected = dashboard
    ? `${formatCurrency(dashboard.revenueCollectedThisMonth)} in ${monthName}`
    : "—";
  const trend = dashboard?.revenueTrendPercent;

  return (
    <ContentArea className="max-w-[1400px]">
      <PageHeader
        title="Maintenance Plans"
        actions={
          <>
            <Button variant="ghost" size="icon">
              <HelpCircle className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon">
              <Smile className="h-5 w-5" />
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/maintenance-plans/templates/new">
                <Plus className="h-4 w-4" />
                Service plan
              </Link>
            </Button>
            <Button variant="ghost" size="icon" asChild>
              <Link href="/settings/maintenance">
                <Settings className="h-5 w-5" />
              </Link>
            </Button>
          </>
        }
      />

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading dashboard...</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {dashboard && (
            <>
              <PlanSummaryCard
                totalPlans={dashboard.summary.totalEnrollments}
                revenueAllTime={formatCurrency(dashboard.summary.revenueAllTime)}
                statuses={enrollmentStatusesToDisplay(dashboard.summary.statuses)}
              />
              <RecurringRevenueCard items={dashboard.recurringRevenue} />
            </>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base font-semibold">Revenue collected</CardTitle>
              <Link href="/reporting/service-plans" className="text-sm text-primary hover:underline">
                View all
              </Link>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{revenueCollected}</p>
              {trend != null && (
                <Badge variant={trend >= 0 ? "default" : "destructive"} className="mt-2">
                  {trend >= 0 ? "↑" : "↓"} {Math.abs(trend).toFixed(2)}%
                </Badge>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base font-semibold">Plan templates</CardTitle>
              <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                <Link href="/maintenance-plans/templates/new">
                  <Plus className="h-4 w-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {dashboard && dashboard.templates.length > 0 ? (
                <ul className="space-y-2">
                  {dashboard.templates.slice(0, 4).map((t) => (
                    <li key={t.id} className="flex items-center justify-between text-sm">
                      <Link
                        href={`/maintenance-plans/templates/${t.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {t.name}
                      </Link>
                      <span className="text-muted-foreground">{formatCurrency(t.basePrice)}/yr</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Create reusable templates for common maintenance plans.
                </p>
              )}
              <Link
                href="/maintenance-plans/templates"
                className="mt-3 inline-block text-sm text-primary hover:underline"
              >
                View all templates
              </Link>
            </CardContent>
          </Card>

          <div className="lg:col-span-2">
            <DueForBillingCard rows={billingRows} />
          </div>

          <div className="lg:col-span-2">
            <UnscheduledVisitsCard />
          </div>

          <div className="lg:col-span-2">
            <SmartIrrigationPanel />
          </div>
        </div>
      )}
    </ContentArea>
  );
}
