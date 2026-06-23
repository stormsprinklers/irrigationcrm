"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { PortalShell } from "./PortalShell";

type Invoice = {
  id: string;
  invoiceNumber: string;
  status: string;
  total: number;
  balanceDue: number;
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
        <h1 className="text-2xl font-semibold">Invoices</h1>
        {invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">No invoices yet.</p>
        ) : (
          <ul className="space-y-2">
            {invoices.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between rounded-lg border border-border bg-white p-4">
                <div>
                  <p className="font-medium">{inv.invoiceNumber}</p>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(inv.createdAt), "MMM d, yyyy")} · ${inv.total.toFixed(2)}
                  </p>
                </div>
                <div className="text-right">
                  {inv.balanceDue > 0 ? (
                    <Link href={`/pay/${inv.publicToken}`} className="text-sm font-medium text-primary hover:underline">
                      Pay ${inv.balanceDue.toFixed(2)}
                    </Link>
                  ) : (
                    <span className="text-sm text-muted-foreground">Paid</span>
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
