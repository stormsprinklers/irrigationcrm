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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = search ? `?search=${encodeURIComponent(search)}` : "";
    fetch(`/api/visits${params}`)
      .then((r) => r.json())
      .then((data) => setVisits(data.visits ?? []))
      .catch(() => toast.error("Failed to load jobs"))
      .finally(() => setLoading(false));
  }, [search]);

  return (
    <ContentArea>
      <PageHeader breadcrumb={["Customers", "Jobs"]} title="Jobs" />
      <div className="mb-4">
        <Input
          placeholder="Search jobs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : visits.length === 0 ? (
        <p className="text-sm text-muted-foreground">No jobs found.</p>
      ) : (
        <div className="rounded-lg border border-border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
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
