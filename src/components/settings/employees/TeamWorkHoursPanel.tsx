"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { defaultEmployeeWorkSchedule } from "@/lib/schedule/open-time-slots";
import type { WorkScheduleDayDTO } from "@/lib/schedule/time-off-types";
import { EmployeeWorkHoursEditor } from "./EmployeeWorkHoursEditor";

type EmployeeRow = {
  id: string;
  name: string;
  role?: string;
};

const FIELD_HOURS_ROLES = new Set(["TECH", "INSTALLER"]);

export function TeamWorkHoursPanel() {
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [schedules, setSchedules] = useState<Record<string, WorkScheduleDayDTO[]>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, filtersRes] = await Promise.all([
        fetch("/api/settings/employees?status=ACTIVE"),
        fetch("/api/schedule/filters"),
      ]);
      const empData = empRes.ok ? await empRes.json() : [];
      const filterData = filtersRes.ok ? await filtersRes.json() : {};
      const list = (Array.isArray(empData) ? empData : [])
        .filter((employee: EmployeeRow) => FIELD_HOURS_ROLES.has(employee.role ?? ""))
        .map((employee: { id: string; name: string; firstName?: string; lastName?: string; role?: string }) => ({
          id: employee.id,
          name: employee.name || [employee.firstName, employee.lastName].filter(Boolean).join(" "),
          role: employee.role,
        }));
      setEmployees(list);
      const loaded: Record<string, WorkScheduleDayDTO[]> = filterData.openTimeSlots?.workSchedules ?? {};
      const next: Record<string, WorkScheduleDayDTO[]> = {};
      for (const employee of list) {
        next[employee.id] = loaded[employee.id] ?? defaultEmployeeWorkSchedule();
      }
      setSchedules(next);
    } catch {
      toast.error("Failed to load work hours");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveEmployee(userId: string) {
    setSavingId(userId);
    try {
      const res = await fetch("/api/schedule/team", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, days: schedules[userId] ?? [] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      toast.success("Work hours saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save work hours");
    } finally {
      setSavingId(null);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading work hours...</p>;
  }

  if (employees.length === 0) {
    return <p className="text-sm text-muted-foreground">No technicians or installers to schedule.</p>;
  }

  return (
    <div className="space-y-4">
      {employees.map((employee) => (
        <section key={employee.id} className="rounded-lg border border-border p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">{employee.name}</h3>
            <Button
              size="sm"
              onClick={() => void saveEmployee(employee.id)}
              disabled={savingId === employee.id}
            >
              {savingId === employee.id ? "Saving..." : "Save hours"}
            </Button>
          </div>
          <EmployeeWorkHoursEditor
            days={schedules[employee.id] ?? defaultEmployeeWorkSchedule()}
            onChange={(days) =>
              setSchedules((current) => ({
                ...current,
                [employee.id]: days,
              }))
            }
            disabled={savingId === employee.id}
          />
        </section>
      ))}
    </div>
  );
}
