"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { useWinterizationTab } from "@/components/layout/CompanyBrandProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPhoneDisplay } from "@/lib/inbox/phone";

type Row = {
  id: string;
  status: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  zip: string | null;
  zoneCount: number | null;
  quotedPrice: number | null;
  weekLabel: string;
  schedulingNotes: string | null;
  shutoffValveLocation: string | null;
  timerLocation: string | null;
  customerId: string | null;
  createdAt: string;
};

export default function WinterizationListPage() {
  const { enabled } = useWinterizationTab();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("NEED_BOOKING");

  function load() {
    setLoading(true);
    fetch(`/api/winterization/requests?status=${encodeURIComponent(status)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        setRows(data.requests ?? []);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, status]);

  async function setRowStatus(id: string, next: string) {
    const res = await fetch(`/api/winterization/requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (!res.ok) {
      toast.error("Could not update");
      return;
    }
    toast.success(next === "SCHEDULED" ? "Marked scheduled" : "Updated");
    load();
  }

  if (!enabled) {
    return (
      <ContentArea className="max-w-2xl">
        <PageHeader title="Winterization" />
        <p className="text-sm text-muted-foreground">
          This list is hidden right now. Irrigation companies can turn it on or set a seasonal
          window under{" "}
          <Link href="/settings" className="text-primary underline">
            Settings → Company → Industry features
          </Link>
          .
        </p>
      </ContentArea>
    );
  }

  return (
    <ContentArea className="max-w-6xl">
      <PageHeader
        title="Winterization"
        subtitle="Customers who requested a blow-out week and still need a specific appointment date."
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {[
          { id: "NEED_BOOKING", label: "Need booking" },
          { id: "SCHEDULED", label: "Scheduled" },
          { id: "ALL", label: "All open" },
        ].map((option) => (
          <Button
            key={option.id}
            type="button"
            size="sm"
            variant={status === option.id ? "default" : "outline"}
            onClick={() => setStatus(option.id)}
          >
            {option.label}
          </Button>
        ))}
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No winterization requests in this view.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Week</TableHead>
              <TableHead>Zones</TableHead>
              <TableHead>Quote</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <div className="font-medium">
                    {row.customerId ? (
                      <Link className="text-primary hover:underline" href={`/customers/${row.customerId}`}>
                        {row.name}
                      </Link>
                    ) : (
                      row.name
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {row.phone ? (
                      <a className="hover:underline" href={`tel:${row.phone}`}>
                        {formatPhoneDisplay(row.phone)}
                      </a>
                    ) : null}
                    {row.city || row.zip ? ` · ${[row.city, row.zip].filter(Boolean).join(" ")}` : ""}
                  </div>
                  {row.address ? (
                    <div className="text-xs text-muted-foreground">{row.address}</div>
                  ) : null}
                </TableCell>
                <TableCell>
                  <div>{row.weekLabel}</div>
                  <Badge variant="outline" className="mt-1">
                    {row.status === "NEED_BOOKING" ? "Needs date" : row.status.toLowerCase()}
                  </Badge>
                </TableCell>
                <TableCell>{row.zoneCount ?? "—"}</TableCell>
                <TableCell>{row.quotedPrice != null ? `$${row.quotedPrice}` : "—"}</TableCell>
                <TableCell className="max-w-xs text-xs text-muted-foreground">
                  {row.shutoffValveLocation ? <div>Valve: {row.shutoffValveLocation}</div> : null}
                  {row.timerLocation ? <div>Timer: {row.timerLocation}</div> : null}
                  {row.schedulingNotes ? <div>{row.schedulingNotes}</div> : null}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  {row.status === "NEED_BOOKING" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void setRowStatus(row.id, "SCHEDULED")}
                    >
                      Mark scheduled
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </ContentArea>
  );
}
