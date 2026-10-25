"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Calendar, ArrowLeft, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { formatPhoneDisplay } from "@/lib/inbox/phone";

type QueueItem = {
  id: string;
  total: number;
  installDurationDays: number | null;
  approvedAt: string | null;
  visitId: string | null;
  customer: { id: string; name: string; phone: string | null };
  property: { id: string; name: string; address: string | null; city: string | null } | null;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export default function NeedsSchedulingPage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingDismissal, setPendingDismissal] = useState<QueueItem | null>(null);
  const [dismissing, setDismissing] = useState(false);

  const loadItems = useCallback(() => {
    fetch("/api/estimates/needs-scheduling")
      .then((r) => r.json())
      .then((data) => setItems(data.estimates ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadItems();
    const timer = window.setInterval(loadItems, 30_000);
    window.addEventListener("focus", loadItems);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", loadItems);
    };
  }, [loadItems]);

  async function dismissItem() {
    if (!pendingDismissal || dismissing) return;
    setDismissing(true);
    try {
      const res = await fetch("/api/estimates/needs-scheduling", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estimateId: pendingDismissal.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not check off this job");
      setItems((current) => current.filter((item) => item.id !== pendingDismissal.id));
      setPendingDismissal(null);
      toast.success("Removed from needs scheduling");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not check off this job");
    } finally {
      setDismissing(false);
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/schedule">
            <ArrowLeft className="h-4 w-4" />
            Schedule
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">Needs scheduling</h1>
          <p className="text-sm text-muted-foreground">
            Approved design estimates with deposit paid, awaiting install dates
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No estimates waiting to be scheduled.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((est) => (
            <Card key={est.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">
                  <Link href={`/customers/${est.customer.id}`} className="hover:underline">
                    {est.customer.name}
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <div className="space-y-1 text-muted-foreground">
                  {est.property ? (
                    <p>
                      {est.property.name}
                      {est.property.address ? ` — ${est.property.address}` : ""}
                      {est.property.city ? `, ${est.property.city}` : ""}
                    </p>
                  ) : null}
                  <p>
                    {formatCurrency(est.total)}
                    {est.installDurationDays ? ` · ${est.installDurationDays}-day install` : ""}
                    {est.approvedAt
                      ? ` · Approved ${format(new Date(est.approvedAt), "MMM d, yyyy")}`
                      : ""}
                  </p>
                  {est.customer.phone ? (
                    <p>{formatPhoneDisplay(est.customer.phone)}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/customers/estimates/${est.id}`}>View estimate</Link>
                  </Button>
                  {est.visitId ? (
                    <Button size="sm" asChild>
                      <Link href={`/visits/${est.visitId}`}>Open install visit</Link>
                    </Button>
                  ) : null}
                  <Button size="sm" asChild>
                    <Link href="/schedule">
                      <Calendar className="h-4 w-4" />
                      Schedule board
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setPendingDismissal(est)}>
                    <CheckCircle2 className="h-4 w-4" />
                    Check off
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={Boolean(pendingDismissal)}
        title="Check off this scheduling item?"
        description={`${pendingDismissal?.customer.name ?? "This job"} will be removed from the needs-scheduling list without changing the appointment.`}
        confirmLabel="Check off"
        busy={dismissing}
        onCancel={() => setPendingDismissal(null)}
        onConfirm={() => void dismissItem()}
      />
    </div>
  );
}
