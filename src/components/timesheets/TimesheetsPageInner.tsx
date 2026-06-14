"use client";

import { useCallback, useEffect, useState } from "react";
import { format, startOfWeek, subWeeks } from "date-fns";
import Link from "next/link";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

type TimesheetEntry = {
  id: string;
  userId: string;
  userName: string;
  clockInAt: string;
  clockOutAt: string | null;
  durationHours: number;
  inProgress: boolean;
};

type PaySummary = {
  userId: string;
  userName: string;
  payType: string | null;
  clockedHours: number;
  hourlyPay: number;
  commissionPay: number;
  projectedPayout: number;
};

function formatTime(iso: string) {
  return format(new Date(iso), "h:mm a");
}

function formatDate(iso: string) {
  return format(new Date(iso), "MMM d, yyyy");
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export function TimesheetsPageInner() {
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 0 });
  const [from, setFrom] = useState(format(weekStart, "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [userId, setUserId] = useState("");
  const [entries, setEntries] = useState<TimesheetEntry[]>([]);
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
  const [canViewAll, setCanViewAll] = useState(false);
  const [paySummaries, setPaySummaries] = useState<PaySummary[]>([]);
  const [loading, setLoading] = useState(true);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to });
      if (userId) params.set("userId", userId);
      const res = await fetch(`/api/timesheets?${params}`);
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to load timesheets");
        return;
      }
      setEntries(data.entries ?? []);
      setCanViewAll(Boolean(data.canViewAll));
      setEmployees(data.employees ?? []);
    } catch {
      toast.error("Failed to load timesheets");
    } finally {
      setLoading(false);
    }
  }, [from, to, userId]);

  const loadPayPreview = useCallback(async () => {
    if (!canViewAll) return;
    try {
      const res = await fetch("/api/timesheets/pay-preview");
      const data = await res.json();
      if (res.ok) {
        setPaySummaries(data.summaries ?? []);
      }
    } catch {
      /* optional section */
    }
  }, [canViewAll]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    if (canViewAll) loadPayPreview();
  }, [canViewAll, loadPayPreview]);

  function setLastWeek() {
    const start = subWeeks(startOfWeek(new Date(), { weekStartsOn: 0 }), 1);
    setFrom(format(start, "yyyy-MM-dd"));
    setTo(format(new Date(start.getTime() + 6 * 86400000), "yyyy-MM-dd"));
  }

  return (
    <ContentArea className="max-w-5xl">
      <PageHeader
        breadcrumb={["Timesheets"]}
        title="Timesheets"
        subtitle="Shift clock in/out records for payroll"
      />

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium">From</label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">To</label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        {canViewAll ? (
          <div>
            <label className="mb-1 block text-sm font-medium">Employee</label>
            <select
              className="h-10 rounded-md border border-border px-3 text-sm"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            >
              <option value="">All employees</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <Button type="button" variant="outline" onClick={setLastWeek}>
          Last week
        </Button>
        <Button type="button" onClick={loadEntries}>
          Apply
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No timesheet entries in this range.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                {canViewAll ? <TableHead>Employee</TableHead> : null}
                <TableHead>Date</TableHead>
                <TableHead>Clock in</TableHead>
                <TableHead>Clock out</TableHead>
                <TableHead>Duration</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id}>
                  {canViewAll ? <TableCell>{entry.userName}</TableCell> : null}
                  <TableCell>{formatDate(entry.clockInAt)}</TableCell>
                  <TableCell>{formatTime(entry.clockInAt)}</TableCell>
                  <TableCell>
                    {entry.inProgress ? (
                      <Badge variant="secondary">In progress</Badge>
                    ) : entry.clockOutAt ? (
                      formatTime(entry.clockOutAt)
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{entry.durationHours.toFixed(2)}h</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {canViewAll && paySummaries.length > 0 ? (
        <section className="mt-10">
          <h2 className="mb-3 text-lg font-semibold">Current pay period preview</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Hybrid employees receive the higher of hourly or commission pay. Configure rates in{" "}
            <Link href="/settings/employees" className="text-primary hover:underline">
              Employees
            </Link>{" "}
            and commission basis in{" "}
            <Link href="/settings/compensation" className="text-primary hover:underline">
              Compensation
            </Link>
            .
          </p>
          <div className="overflow-hidden rounded-lg border border-border bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Pay type</TableHead>
                  <TableHead>Clocked hours</TableHead>
                  <TableHead>Hourly pay</TableHead>
                  <TableHead>Commission</TableHead>
                  <TableHead>Projected payout</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paySummaries.map((row) => (
                  <TableRow key={row.userId}>
                    <TableCell>{row.userName}</TableCell>
                    <TableCell>{row.payType ?? "—"}</TableCell>
                    <TableCell>{row.clockedHours.toFixed(2)}h</TableCell>
                    <TableCell>{formatCurrency(row.hourlyPay)}</TableCell>
                    <TableCell>{formatCurrency(row.commissionPay)}</TableCell>
                    <TableCell className="font-medium">{formatCurrency(row.projectedPayout)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}
    </ContentArea>
  );
}
