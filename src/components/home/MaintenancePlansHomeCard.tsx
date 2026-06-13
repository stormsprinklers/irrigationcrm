"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Wrench } from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function MaintenancePlansHomeCard() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/maintenance-plans/dashboard")
      .then((r) => r.json())
      .then((data) => setCount(data.unscheduledVisitCount ?? 0))
      .catch(() => setCount(0));
  }, []);

  const message =
    count === null
      ? "Loading maintenance plan status..."
      : count === 0
        ? "You're all caught up! 0 unscheduled service visits."
        : `${count} unscheduled service visit${count === 1 ? "" : "s"} need scheduling.`;

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <Wrench className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base font-semibold">Maintenance Plans</CardTitle>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
          <Link href="/maintenance-plans/templates/new">
            <span className="sr-only">New plan</span>+
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="flex-1">
        <div className={`rounded-lg p-4 ${count && count > 0 ? "bg-highlight-panel" : "bg-highlight"}`}>
          {count && count > 0 ? (
            <>
              <p className="text-sm font-medium text-primary">{count} unscheduled visits</p>
              <p className="mt-1 text-sm text-muted-foreground">Schedule seasonal maintenance from the dashboard.</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{message}</p>
          )}
        </div>
      </CardContent>
      <CardFooter className="pt-0">
        <Link href="/maintenance-plans" className="text-sm font-medium text-primary hover:underline">
          Manage plans
        </Link>
      </CardFooter>
    </Card>
  );
}
