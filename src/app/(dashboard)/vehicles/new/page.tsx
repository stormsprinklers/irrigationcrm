"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmployeeSearchPicker } from "@/components/schedule/EmployeeSearchPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Employee = { id: string; name: string };

export default function NewVehiclePage() {
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [saving, setSaving] = useState(false);
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [vin, setVin] = useState("");
  const [licensePlate, setLicensePlate] = useState("");
  const [assignedUserId, setAssignedUserId] = useState("");
  const [assignedUserName, setAssignedUserName] = useState("");
  const [currentMileage, setCurrentMileage] = useState("0");
  const [oilIntervalMiles, setOilIntervalMiles] = useState("5000");
  const [oilIntervalMonths, setOilIntervalMonths] = useState("6");
  const [lastOilChangeAt, setLastOilChangeAt] = useState("");
  const [lastOilChangeMileage, setLastOilChangeMileage] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/vehicles?employees=1&status=ALL");
      if (!res.ok) return;
      const data = await res.json();
      if (!data.canManage) {
        toast.error("You do not have permission to add vehicles");
        router.replace("/vehicles");
        return;
      }
      setEmployees(data.employees ?? []);
    })();
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          make,
          model,
          year: Number(year),
          vin: vin || null,
          licensePlate: licensePlate || null,
          assignedUserId: assignedUserId || null,
          currentMileage: Number(currentMileage) || 0,
          oilIntervalMiles: Number(oilIntervalMiles) || 5000,
          oilIntervalMonths: Number(oilIntervalMonths) || 6,
          lastOilChangeAt: lastOilChangeAt || null,
          lastOilChangeMileage: lastOilChangeMileage || null,
          notes: notes || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Failed to create vehicle");
        return;
      }
      toast.success("Vehicle created");
      router.push(`/vehicles/${data.id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ContentArea className="max-w-2xl">
      <PageHeader
        breadcrumb={["Vehicles", "Add vehicle"]}
        title="Add vehicle"
        subtitle="Create a fleet vehicle profile"
        actions={
          <Button asChild variant="outline">
            <Link href="/vehicles">Cancel</Link>
          </Button>
        }
      />

      <form onSubmit={onSubmit} className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <label htmlFor="year" className="text-sm font-medium">Year</label>
            <Input
              id="year"
              type="number"
              required
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="make" className="text-sm font-medium">Make</label>
            <Input id="make" required value={make} onChange={(e) => setMake(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label htmlFor="model" className="text-sm font-medium">Model</label>
            <Input id="model" required value={model} onChange={(e) => setModel(e.target.value)} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="vin" className="text-sm font-medium">VIN</label>
            <Input id="vin" value={vin} onChange={(e) => setVin(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label htmlFor="plate" className="text-sm font-medium">License plate</label>
            <Input
              id="plate"
              value={licensePlate}
              onChange={(e) => setLicensePlate(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Assigned to</label>
          <p className="text-xs text-muted-foreground">Leave empty for Shop.</p>
          <EmployeeSearchPicker
            value={assignedUserId}
            selectedName={assignedUserName}
            employees={employees}
            placeholder="Search employees by name…"
            onValueChange={(id, name) => {
              setAssignedUserId(id);
              setAssignedUserName(name);
            }}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <label htmlFor="mileage" className="text-sm font-medium">Current mileage</label>
            <Input
              id="mileage"
              type="number"
              min={0}
              value={currentMileage}
              onChange={(e) => setCurrentMileage(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="oilMiles" className="text-sm font-medium">Oil interval (miles)</label>
            <Input
              id="oilMiles"
              type="number"
              min={1}
              value={oilIntervalMiles}
              onChange={(e) => setOilIntervalMiles(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="oilMonths" className="text-sm font-medium">Oil interval (months)</label>
            <Input
              id="oilMonths"
              type="number"
              min={1}
              value={oilIntervalMonths}
              onChange={(e) => setOilIntervalMonths(e.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="lastOil" className="text-sm font-medium">Last oil change date</label>
            <Input
              id="lastOil"
              type="date"
              value={lastOilChangeAt}
              onChange={(e) => setLastOilChangeAt(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="lastOilMi" className="text-sm font-medium">Last oil change mileage</label>
            <Input
              id="lastOilMi"
              type="number"
              min={0}
              value={lastOilChangeMileage}
              onChange={(e) => setLastOilChangeMileage(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="notes" className="text-sm font-medium">Notes</label>
          <textarea className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50" id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" asChild>
            <Link href="/vehicles">Cancel</Link>
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Create vehicle"}
          </Button>
        </div>
      </form>
    </ContentArea>
  );
}
