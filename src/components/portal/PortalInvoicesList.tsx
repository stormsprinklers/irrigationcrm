"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import { PortalShell } from "./PortalShell";
import {
  PortalPayAllInvoicesButton,
  confirmPortalInvoiceCheckout,
} from "./PortalPayAllInvoicesButton";

type Invoice = {
  id: string;
  invoiceNumber: string;
  total: number;
  balanceDue: number;
  isPayable: boolean;
  isMaintenancePlan?: boolean;
  statusLabel: string;
  publicToken: string;
  createdAt: string;
};

export function PortalInvoicesList({ slug }: { slug: string }) {
  const searchParams = useSearchParams();
  const paymentStatus = searchParams.get("payment");
  const sessionId = searchParams.get("session_id");
  const confirmed = useRef(false);
  const [me, setMe] = useState<{
    company: { name: string; emailLogoUrl: string | null; features: Record<string, boolean> };
  } | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  function load() {
    return Promise.all([
      fetch("/api/portal/me").then((r) => r.json()),
      fetch("/api/portal/invoices").then((r) => r.json()),
    ]).then(([meData, invData]) => {
      setMe(meData);
      setInvoices(invData.invoices ?? []);
    });
  }

  useEffect(() => {
    load().catch(() => toast.error("Failed to load invoices"));
  }, []);

  useEffect(() => {
    if (paymentStatus !== "success" || !sessionId || confirmed.current) return;
    confirmed.current = true;
    confirmPortalInvoiceCheckout(sessionId)
      .then(() => {
        toast.success("Payment received");
        return load();
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Unable to confirm payment");
      });
  }, [paymentStatus, sessionId]);

  const jobDue = useMemo(
    () => invoices.filter((invoice) => invoice.isPayable && !invoice.isMaintenancePlan),
    [invoices]
  );
  const jobDueTotal = jobDue.reduce((sum, invoice) => sum + invoice.balanceDue, 0);

  if (!me) return <p className="text-sm text-muted-foreground">Loading...</p>;

  return (
    <PortalShell
      slug={slug}
      companyName={me.company.name}
      emailLogoUrl={me.company.emailLogoUrl}
      features={me.company.features as never}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-2xl uppercase tracking-wide text-storm-navy">Invoices</h1>
          <PortalPayAllInvoicesButton
            returnPath={`/portal/${slug}/invoices`}
            count={jobDue.length}
            total={jobDueTotal}
          />
        </div>
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
                    {inv.isMaintenancePlan ? " · Maintenance plan" : ""}
                  </p>
                </div>
                <div className="text-right">
                  {inv.isPayable && inv.isMaintenancePlan ? (
                    <Link
                      href={`/portal/${slug}/maintenance`}
                      className="inline-flex min-h-11 items-center text-sm font-semibold text-storm-coral hover:underline"
                    >
                      Pay on plan
                    </Link>
                  ) : inv.isPayable ? (
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
