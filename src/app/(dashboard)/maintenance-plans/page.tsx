import { DueForBillingCard } from "@/components/maintenance-plans/DueForBillingCard";
import { PlanSummaryCard } from "@/components/maintenance-plans/PlanSummaryCard";
import { RecurringRevenueCard } from "@/components/maintenance-plans/RecurringRevenueCard";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  billingDueRows,
  planStatuses,
  planSummary,
  recurringRevenue,
  revenueCollected,
} from "@/lib/mock/maintenance-plans";
import { HelpCircle, Plus, Settings, Smile } from "lucide-react";
import Link from "next/link";

export default function MaintenancePlansPage() {
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
            <Button variant="outline" size="sm">
              <Plus className="h-4 w-4" />
              Service plan
            </Button>
            <Button variant="ghost" size="icon">
              <Settings className="h-5 w-5" />
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PlanSummaryCard
          totalPlans={planSummary.totalPlans}
          revenueAllTime={planSummary.revenueAllTime}
          statuses={planStatuses}
        />
        <RecurringRevenueCard items={recurringRevenue} />

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base font-semibold">Revenue collected</CardTitle>
            <Link href="#" className="text-sm text-primary hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{revenueCollected.amount}</p>
            <Badge variant="destructive" className="mt-2">
              ↓ {revenueCollected.trend.replace("-", "")}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base font-semibold">Plan templates</CardTitle>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Plus className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Create reusable templates for common maintenance plans.
            </p>
          </CardContent>
        </Card>

        <div className="lg:col-span-2">
          <DueForBillingCard rows={billingDueRows} />
        </div>
      </div>
    </ContentArea>
  );
}
