"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { PortalShell } from "./PortalShell";

type BillingSummary = {
  invoiceBalanceDue: number;
  maintenanceBalanceDue: number;
  totalBalanceDue: number;
  overdueTotal: number;
  payableInvoices: Array<{
    id: string;
    invoiceNumber: string;
    balanceDue: number;
    publicToken: string;
    createdAt: string;
  }>;
  unpaidMaintenancePeriods: Array<{
    id: string;
    enrollmentId: string;
    planName: string;
    propertyName: string;
    amount: number;
    dueDate: string;
    status: string;
    isLate: boolean;
  }>;
};

function money(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export function PortalPayBalanceView({ slug }: { slug: string }) {
  const [me, setMe] = useState<{
    company: { name: string; emailLogoUrl: string | null; features: Record<string, boolean> };
  } | null>(null);
  const [summary, setSummary] = useState<BillingSummary | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/portal/me").then((r) => r.json()),
      fetch("/api/portal/billing-summary").then((r) => r.json()),
    ]).then(([meData, billing]) => {
      setMe(meData);
      setSummary(billing);
    });
  }, []);

  if (!me || !summary) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  return (
    <PortalShell
      slug={slug}
      companyName={me.company.name}
      emailLogoUrl={me.company.emailLogoUrl}
      features={me.company.features as never}
    >
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl uppercase tracking-wide text-storm-navy">
            Pay your balance
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Open invoices and maintenance billing in one place.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Total due</p>
          <p className="mt-1 text-3xl font-semibold text-slate-900">
            {money(summary.totalBalanceDue)}
          </p>
        </div>

        {summary.payableInvoices.length > 0 ? (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-storm-navy">Invoices</h2>
            <ul className="space-y-2">
              {summary.payableInvoices.map((inv) => (
                <li
                  key={inv.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-white px-4 py-3"
                >
                  <div>
                    <p className="font-medium">{inv.invoiceNumber}</p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(inv.createdAt), "MMM d, yyyy")} · {money(inv.balanceDue)}
                    </p>
                  </div>
                  <Button asChild className="bg-storm-coral hover:bg-storm-coral/90">
                    <Link href={`/pay/${inv.publicToken}`}>Pay invoice</Link>
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {summary.unpaidMaintenancePeriods.length > 0 ? (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-storm-navy">Maintenance billing</h2>
            <div className="rounded-lg border border-border bg-white p-4">
              <p className="font-medium">
                {money(summary.maintenanceBalanceDue)} due on your maintenance plan
              </p>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {summary.unpaidMaintenancePeriods.map((p) => (
                  <li key={p.id}>
                    {p.planName} · {money(p.amount)} · due{" "}
                    {format(new Date(p.dueDate), "MMM d, yyyy")}
                  </li>
                ))}
              </ul>
              <Button asChild className="mt-4 bg-storm-coral hover:bg-storm-coral/90">
                <Link href={`/portal/${slug}/maintenance`}>
                  Pay maintenance & choose billing
                </Link>
              </Button>
            </div>
          </section>
        ) : null}

        {summary.totalBalanceDue <= 0 ? (
          <p className="text-sm text-muted-foreground">You&apos;re all caught up — nothing due.</p>
        ) : null}
      </div>
    </PortalShell>
  );
}
