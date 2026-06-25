"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CustomerNameWithBadge } from "@/components/customers/CustomerNameWithBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type UnscheduledVisit = {
  id: string;
  customer: string;
  customerDoNotService?: boolean;
  property: string;
  visitTitle: string;
  dueMonth: number;
  dueYear: number;
  status: string;
};

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export function UnscheduledVisitsCard() {
  const router = useRouter();
  const [visits, setVisits] = useState<UnscheduledVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [schedulingId, setSchedulingId] = useState<string | null>(null);
  const [scheduleDialogId, setScheduleDialogId] = useState<string | null>(null);
  const [assignedUserId, setAssignedUserId] = useState("");
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);

  const load = useCallback(async () => {
    const res = await fetch("/api/maintenance-plans/visits/unscheduled");
    if (res.ok) {
      const data = await res.json();
      setVisits(data.visits ?? []);
    }
  }, []);

  useEffect(() => {
    load()
      .catch(() => toast.error("Failed to load unscheduled visits"))
      .finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    if (!scheduleDialogId) return;
    fetch("/api/schedule/filters")
      .then((r) => r.json())
      .then((data) => setEmployees(data.employees ?? []))
      .catch(() => toast.error("Failed to load technicians"));
  }, [scheduleDialogId]);

  async function scheduleVisit(planVisitId: string) {
    if (!assignedUserId) {
      toast.error("Assign a technician before scheduling this visit");
      return;
    }

    setSchedulingId(planVisitId);
    try {
      const res = await fetch(`/api/maintenance-plans/visits/${planVisitId}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedUserId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Failed to schedule visit");
        return;
      }
      const visit = await res.json();
      toast.success("Visit scheduled");
      setScheduleDialogId(null);
      setAssignedUserId("");
      router.push(`/visits/${visit.id}`);
    } catch {
      toast.error("Failed to schedule visit");
    } finally {
      setSchedulingId(null);
    }
  }

  return (
    <>
      <Card className="h-full">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base font-semibold">Unscheduled visits</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : visits.length === 0 ? (
            <p className="text-sm text-muted-foreground">All plan visits are scheduled.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Property</TableHead>
                  <TableHead>Visit</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visits.map((visit) => (
                  <TableRow key={visit.id}>
                    <TableCell className="font-medium">
                      <CustomerNameWithBadge
                        name={visit.customer}
                        doNotService={visit.customerDoNotService}
                      />
                    </TableCell>
                    <TableCell>{visit.property}</TableCell>
                    <TableCell>{visit.visitTitle}</TableCell>
                    <TableCell>
                      {MONTHS[visit.dueMonth - 1]} {visit.dueYear}
                    </TableCell>
                    <TableCell>
                      <Badge variant={visit.status === "OVERDUE" ? "destructive" : "outline"}>
                        {visit.status === "OVERDUE" ? "Overdue" : "Unscheduled"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={schedulingId === visit.id || visit.customerDoNotService}
                        title={
                          visit.customerDoNotService
                            ? "Customer is marked DO NOT SERVICE"
                            : undefined
                        }
                        onClick={() => {
                          setScheduleDialogId(visit.id);
                          setAssignedUserId("");
                        }}
                      >
                        <CalendarPlus className="h-4 w-4" />
                        Schedule
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {scheduleDialogId ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close"
            onClick={() => setScheduleDialogId(null)}
          />
          <div className="relative z-10 w-full max-w-sm rounded-lg border bg-background p-6 shadow-lg">
            <h2 className="text-lg font-semibold">Schedule maintenance visit</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose a technician before adding this visit to the schedule.
            </p>
            <select
              value={assignedUserId}
              onChange={(e) => setAssignedUserId(e.target.value)}
              className={`${selectClassName} mt-4`}
              required
            >
              <option value="">Assign technician (required)</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </select>
            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setScheduleDialogId(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={schedulingId === scheduleDialogId}
                onClick={() => scheduleVisit(scheduleDialogId)}
              >
                {schedulingId === scheduleDialogId ? "Scheduling..." : "Schedule visit"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
