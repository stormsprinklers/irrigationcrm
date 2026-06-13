import type { PlanStatusDisplay } from "@/lib/maintenance-plans/format";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function PlanSummaryCard({
  totalPlans,
  revenueAllTime,
  statuses,
}: {
  totalPlans: number;
  revenueAllTime: string;
  statuses: PlanStatusDisplay[];
}) {
  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base font-semibold">Plan summary</CardTitle>
        <Link href="/maintenance-plans" className="text-sm text-primary hover:underline">
          View all
        </Link>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <p className="text-3xl font-bold">{totalPlans}</p>
          <p className="text-sm text-muted-foreground">{revenueAllTime} revenue all time</p>
        </div>
        <div className="flex items-center gap-6">
          <div className="relative h-24 w-24 shrink-0">
            <div className="absolute inset-0 rounded-full border-[12px] border-green-500" />
            <div className="absolute inset-0 rounded-full border-[12px] border-gray-300 border-t-transparent border-r-transparent border-b-transparent -rotate-45" />
          </div>
          <ul className="space-y-1 text-xs">
            {statuses.map((status) => (
              <li key={status.status} className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${status.color}`} />
                <span>
                  {status.count} {status.label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
