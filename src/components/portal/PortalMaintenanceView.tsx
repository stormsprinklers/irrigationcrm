"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { PortalShell } from "./PortalShell";

type Enrollment = {
  id: string;
  status: string;
  startDate: string;
  endDate: string | null;
  renewalDate: string | null;
  billingFrequency: string;
  template: { name: string; basePrice: number };
  property: { name: string; address: string | null };
  planVisits: Array<{
    status: string;
    dueYear: number;
    dueMonth: number;
    visitTemplate: { name: string; visitTitle: string; season: string } | null;
    visit: { startAt: string | null; status: string } | null;
  }>;
  billingPeriods: Array<{
    amount: number;
    status: string;
    dueDate: string;
    paidAt: string | null;
  }>;
};

export function PortalMaintenanceView({ slug }: { slug: string }) {
  const [me, setMe] = useState<{ company: { name: string; emailLogoUrl: string | null; features: Record<string, boolean> } } | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);

  useEffect(() => {
    Promise.all([
      fetch("/api/portal/me").then((r) => r.json()),
      fetch("/api/portal/maintenance").then((r) => r.json()),
    ]).then(([meData, maintData]) => {
      setMe(meData);
      setEnrollments(maintData.enrollments ?? []);
    });
  }, []);

  if (!me) return <p className="text-sm text-muted-foreground">Loading...</p>;

  return (
    <PortalShell slug={slug} companyName={me.company.name} emailLogoUrl={me.company.emailLogoUrl} features={me.company.features as never}>
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Maintenance plans</h1>
        {enrollments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No maintenance plan enrollments.</p>
        ) : (
          enrollments.map((e) => (
            <div key={e.id} className="rounded-lg border border-border bg-white p-4 space-y-3">
              <div>
                <p className="font-medium">{e.template.name}</p>
                <p className="text-sm text-muted-foreground">{e.property.name}</p>
                <p className="text-sm capitalize">{e.status.toLowerCase()} · {e.billingFrequency.toLowerCase()}</p>
              </div>
              <div>
                <p className="text-sm font-medium">Upcoming visits</p>
                <ul className="mt-1 space-y-1 text-sm">
                  {e.planVisits
                    .filter((pv) => pv.status !== "COMPLETED")
                    .slice(0, 4)
                    .map((pv, i) => (
                      <li key={i}>
                        {pv.visitTemplate?.visitTitle ?? "Plan visit"} —{" "}
                        {pv.visit?.startAt
                          ? format(new Date(pv.visit.startAt), "MMM d, yyyy")
                          : `${pv.dueMonth}/${pv.dueYear}`}
                      </li>
                    ))}
                </ul>
              </div>
              <div>
                <p className="text-sm font-medium">Billing</p>
                <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                  {e.billingPeriods.slice(-3).map((bp, i) => (
                    <li key={i}>
                      ${bp.amount.toFixed(2)} due {format(new Date(bp.dueDate), "MMM d, yyyy")} — {bp.status.toLowerCase()}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))
        )}
      </div>
    </PortalShell>
  );
}
