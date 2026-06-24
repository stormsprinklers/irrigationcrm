"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { PortalShell } from "./PortalShell";

type Invoice = {
  id: string;
  invoiceNumber: string;
  total: number;
  balanceDue: number;
  isPayable: boolean;
  statusLabel: string;
  publicToken: string;
  createdAt: string;
};

export function PortalInvoicesList({ slug }: { slug: string }) {
  const [me, setMe] = useState<{ company: { name: string; emailLogoUrl: string | null; features: Record<string, boolean> } } | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  useEffect(() => {
    Promise.all([
      fetch("/api/portal/me").then((r) => r.json()),
      fetch("/api/portal/invoices").then((r) => r.json()),
    ]).then(([meData, invData]) => {
      setMe(meData);
      setInvoices(invData.invoices ?? []);
    });
  }, []);

  if (!me) return <p className="text-sm text-muted-foreground">Loading...</p>;

  return (
    <PortalShell slug={slug} companyName={me.company.name} emailLogoUrl={me.company.emailLogoUrl} features={me.company.features as never}>
      <div className="space-y-4">
        <h1 className="font-display text-2xl uppercase tracking-wide text-storm-navy">Invoices</h1>
        {invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">No invoices yet.</p>
        ) : (
          <ul className="space-y-2">
            {invoices.map((inv) => (
              <li key={inv.id} className="portal-card flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-storm-navy">{inv.invoiceNumber}</p>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(inv.createdAt), "MMM d, yyyy")} · ${inv.total.toFixed(2)}
                  </p>
                </div>
                <div className="text-right">
                  {inv.isPayable ? (
                    <Link
                      href={`/pay/${inv.publicToken}`}
                      className="inline-flex min-h-11 items-center text-sm font-semibold text-storm-coral hover:underline"
                    >
                      Pay ${inv.balanceDue.toFixed(2)}
                    </Link>
                  ) : (
                    <span className="text-sm font-medium text-muted-foreground">{inv.statusLabel}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PortalShell>
  );
}
