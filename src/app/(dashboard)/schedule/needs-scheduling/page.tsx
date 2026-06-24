"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Calendar, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

  useEffect(() => {
    fetch("/api/estimates/needs-scheduling")
      .then((r) => r.json())
      .then((data) => setItems(data.estimates ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

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
                  {est.customer.phone ? <p>{est.customer.phone}</p> : null}
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
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
