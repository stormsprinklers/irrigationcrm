"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmployeeForm, type EmployeeRecord } from "./EmployeeForm";
import { CrewManager } from "./CrewManager";
import { ROLE_LABELS } from "@/lib/employees";
import { blobProxyUrl } from "@/lib/blob/urls";

type ServiceAreaOption = { id: string; name: string; color: string };

export function EmployeeList() {
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [serviceAreas, setServiceAreas] = useState<ServiceAreaOption[]>([]);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"ACTIVE" | "ARCHIVED">("ACTIVE");
  const [editing, setEditing] = useState<EmployeeRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [empRes, areaRes] = await Promise.all([
      fetch(`/api/settings/employees?status=${tab}`),
      fetch("/api/settings/service-areas"),
    ]);
    if (empRes.ok) setEmployees(await empRes.json());
    if (areaRes.ok) {
      const areas = await areaRes.json();
      setServiceAreas(areas.map((a: ServiceAreaOption) => ({ id: a.id, name: a.name, color: a.color })));
    }
  }, [tab]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function archiveEmployee(id: string, action: "archive" | "restore") {
    const res = await fetch(`/api/settings/employees/${id}/archive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) {
      toast.error("Failed to update status");
      return;
    }
    toast.success(action === "archive" ? "Employee archived" : "Employee restored");
    await load();
  }

  async function deleteEmployee(id: string) {
    if (!confirm("Permanently delete this employee? This cannot be undone.")) return;
    const res = await fetch(`/api/settings/employees/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? "Delete failed");
      return;
    }
    toast.success("Employee deleted");
    await load();
  }

  const filtered = employees.filter(
    (e) =>
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.email.toLowerCase().includes(search.toLowerCase())
  );

  if (creating || editing) {
    return (
      <EmployeeForm
        employee={editing}
        serviceAreas={serviceAreas}
        onSaved={() => {
          setCreating(false);
          setEditing(null);
          load();
        }}
        onCancel={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <Tabs value={tab} onValueChange={(v) => setTab(v as "ACTIVE" | "ARCHIVED")}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="ACTIVE">Active</TabsTrigger>
            <TabsTrigger value="ARCHIVED">Archived</TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            <Input
              placeholder="Search employees..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-56"
            />
            <Button onClick={() => setCreating(true)}>Add employee</Button>
          </div>
        </div>

        <TabsContent value={tab} className="mt-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">No employees found</p>
          ) : (
            <div className="divide-y rounded-lg border border-border">
              {filtered.map((employee) => (
                <div key={employee.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10 ring-2 ring-offset-1" style={{ outlineColor: employee.color ?? undefined }}>
                      {employee.photoUrl ? (
                        <AvatarImage src={blobProxyUrl(employee.photoUrl)} alt={employee.name} />
                      ) : null}
                      <AvatarFallback style={{ backgroundColor: employee.color ?? "#64748B", color: "#fff" }}>
                        {employee.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{employee.name}</p>
                      <p className="text-sm text-muted-foreground">{employee.email}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Badge variant="secondary">{ROLE_LABELS[employee.role]}</Badge>
                        {employee.title ? <Badge variant="outline">{employee.title}</Badge> : null}
                        {employee.division ? <Badge variant="outline">{employee.division}</Badge> : null}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {process.env.NEXT_PUBLIC_LMS_URL ? (
                      <Button variant="outline" size="sm" asChild>
                        <a
                          href={`${process.env.NEXT_PUBLIC_LMS_URL.replace(/\/$/, "")}/admin/users?email=${encodeURIComponent(employee.email)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          LMS
                        </a>
                      </Button>
                    ) : null}
                    <Button variant="outline" size="sm" onClick={() => setEditing(employee)}>
                      Edit
                    </Button>
                    {employee.status === "ACTIVE" ? (
                      <Button variant="outline" size="sm" onClick={() => archiveEmployee(employee.id, "archive")}>
                        Archive
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => archiveEmployee(employee.id, "restore")}>
                        Restore
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => deleteEmployee(employee.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <CrewManager employees={employees.filter((e) => e.status === "ACTIVE")} />
    </div>
  );
}
