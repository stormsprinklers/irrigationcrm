"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export default function CustomerJobsPage() {
  const [visits, setVisits] = useState<
    Array<{
      id: string;
      title: string;
      status: string;
      startAt: string;
      total?: number;
      customer: { id: string; name: string } | null;
    }>
  >([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    fetch(`/api/visits${params.size ? `?${params.toString()}` : ""}`)
      .then((r) => r.json())
      .then((data) => setVisits(data.visits ?? []))
      .catch(() => toast.error("Failed to load visits"))
      .finally(() => setLoading(false));
  }, [search, status]);

  return (
    <ContentArea>
      <PageHeader breadcrumb={["Customers", "Visits"]} title="Visits" />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          placeholder="Search visits"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          aria-label="Visit status"
        >
          <option value="">All except cancelled</option>
          <option value="UNSCHEDULED">Unscheduled</option>
          <option value="SCHEDULED">Scheduled</option>
          <option value="EN_ROUTE">En route</option>
          <option value="IN_PROGRESS">In progress</option>
          <option value="PAUSED">Paused</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : visits.length === 0 ? (
        <p className="text-sm text-muted-foreground">No visits found.</p>
      ) : (
        <div className="rounded-lg border border-border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Visit</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Scheduled</TableHead>
                <TableHead>Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visits.map((visit) => (
                <TableRow key={visit.id}>
                  <TableCell>
                    <Link href={`/visits/${visit.id}`} className="font-medium text-primary hover:underline">
                      {visit.title}
                    </Link>
                  </TableCell>
                  <TableCell>{visit.customer?.name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{visit.status}</Badge>
                  </TableCell>
                  <TableCell>{format(new Date(visit.startAt), "MMM d, yyyy h:mm a")}</TableCell>
                  <TableCell>{formatCurrency(visit.total ?? 0)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </ContentArea>
  );
}
