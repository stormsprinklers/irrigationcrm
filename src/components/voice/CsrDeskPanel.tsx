"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Calendar, Phone, User } from "lucide-react";
import { toast } from "sonner";
import { CustomerNameWithBadge } from "@/components/customers/CustomerNameWithBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useVoiceDevice } from "@/contexts/VoiceDeviceProvider";
import { TransferDialog } from "@/components/voice/TransferDialog";

type QueueEntry = {
  id: string;
  fromNumber: string;
  queueEnteredAt: string | null;
  customer?: { id: string; name: string; phone?: string | null } | null;
};

type CustomerDetail = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  doNotService?: boolean;
};

type FilterOptions = {
  serviceAreas: { id: string; name: string }[];
  employees: { id: string; name: string }[];
};

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm";

function defaultVisitTimes() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return { date: date.toISOString().slice(0, 10), startTime: "09:00", endTime: "11:00" };
}

export function CsrDeskPanel({
  onVisitBooked,
}: {
  onVisitBooked?: (visitId: string) => void;
}) {
  const { ready, activeCall, connect, disconnect, transfer } = useVoiceDevice();
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [bookOpen, setBookOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    serviceAreas: [],
    employees: [],
  });
  const [saving, setSaving] = useState(false);
  const times = defaultVisitTimes();
  const [visitForm, setVisitForm] = useState({
    title: "Service call",
    division: "SERVICE" as "SERVICE" | "INSTALL",
    date: times.date,
    startTime: times.startTime,
    endTime: times.endTime,
    serviceAreaId: "",
    assignedUserId: "",
  });

  const callerPhone = activeCall?.remoteNumber ?? activeCall?.callerInfo?.phone;
  const customerId = activeCall?.callerInfo?.customerId ?? customer?.id;

  useEffect(() => {
    const loadQueue = () => {
      fetch("/api/voice/queue")
        .then((r) => r.json())
        .then((data) => setQueue(data.queue ?? []))
        .catch(() => {});
    };
    loadQueue();
    const timer = setInterval(loadQueue, 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!callerPhone) {
      setCustomer(null);
      return;
    }
    fetch(`/api/voice/caller-lookup?phone=${encodeURIComponent(callerPhone)}`)
      .then((r) => r.json())
      .then((lookup) => {
        if (lookup.customerId) {
          return fetch(`/api/customers/${lookup.customerId}`)
            .then((r) => r.json())
            .then((data) => {
              if (data.error) {
                setCustomer({
                  id: lookup.customerId,
                  name: lookup.name ?? "Customer",
                  phone: lookup.phone,
                  doNotService: lookup.doNotService,
                });
                return;
              }
              setCustomer({
                id: data.id,
                name: data.name,
                phone: data.phone,
                email: data.email,
                doNotService: data.doNotService,
              });
            });
        }
        setCustomer(
          lookup.name
            ? { id: "", name: lookup.name, phone: lookup.phone }
            : null
        );
      })
      .catch(() => setCustomer(null));
  }, [callerPhone]);

  useEffect(() => {
    if (!bookOpen) return;
    fetch("/api/schedule/filters")
      .then((r) => r.json())
      .then((data) => {
        setFilterOptions({
          serviceAreas: data.serviceAreas ?? [],
          employees: data.employees ?? [],
        });
        if (data.serviceAreas?.[0]?.id) {
          setVisitForm((v) => ({ ...v, serviceAreaId: v.serviceAreaId || data.serviceAreas[0].id }));
        }
      })
      .catch(() => toast.error("Failed to load schedule options"));
  }, [bookOpen]);

  async function submitVisit(e: React.FormEvent) {
    e.preventDefault();
    if (!visitForm.serviceAreaId) {
      toast.error("Service area required");
      return;
    }
    setSaving(true);
    const startAt = new Date(`${visitForm.date}T${visitForm.startTime}`);
    const endAt = new Date(`${visitForm.date}T${visitForm.endTime}`);
    try {
      const res = await fetch("/api/schedule/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: visitForm.title,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          division: visitForm.division,
          serviceAreaId: visitForm.serviceAreaId,
          assignedUserId: visitForm.assignedUserId || null,
          customerId: customerId || null,
          callSessionId: activeCall?.sessionId ?? null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to book");
      }
      const visit = await res.json();
      toast.success("Appointment booked");
      setBookOpen(false);
      onVisitBooked?.(visit.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to book");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid h-full gap-4 lg:grid-cols-3">
      <section className="rounded-lg border border-border bg-white p-4">
        <h3 className="mb-3 flex items-center gap-2 font-semibold">
          <Phone className="h-4 w-4" /> Queue ({queue.length})
        </h3>
        <ScrollArea className="h-64">
          <ul className="space-y-2 text-sm">
            {queue.map((entry) => (
              <li key={entry.id} className="rounded border border-border p-2">
                <p className="font-medium">{entry.customer?.name ?? entry.fromNumber}</p>
                <p className="text-xs text-muted-foreground">{entry.fromNumber}</p>
              </li>
            ))}
            {!queue.length && (
              <li className="text-muted-foreground">No callers waiting.</li>
            )}
          </ul>
        </ScrollArea>
        {!ready && (
          <p className="mt-2 text-xs text-amber-600">Softphone connecting...</p>
        )}
      </section>

      <section className="rounded-lg border border-border bg-white p-4">
        <h3 className="mb-3 flex items-center gap-2 font-semibold">
          <User className="h-4 w-4" /> Customer
        </h3>
        {activeCall ? (
          <div className="space-y-2 text-sm">
            <CustomerNameWithBadge
              name={customer?.name ?? activeCall.callerInfo?.name ?? callerPhone ?? "Unknown caller"}
              doNotService={customer?.doNotService}
              nameClassName="text-lg font-semibold"
            />
            <p className="text-muted-foreground">{callerPhone}</p>
            {customer?.email && <p>{customer.email}</p>}
            {customer?.id && (
              <Button variant="link" className="h-auto p-0" asChild>
                <Link href={`/customers/${customer.id}`}>View customer profile</Link>
              </Button>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No active call.</p>
        )}
      </section>

      <section className="rounded-lg border border-border bg-white p-4">
        <h3 className="mb-3 font-semibold">Actions</h3>
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            disabled={!activeCall || customer?.doNotService}
            onClick={() => setBookOpen(true)}
          >
            <Calendar className="mr-2 h-4 w-4" />
            Book appointment
          </Button>
          <Button
            variant="outline"
            disabled={!activeCall}
            onClick={() => setTransferOpen(true)}
          >
            Transfer call
          </Button>
          <Button variant="destructive" disabled={!activeCall} onClick={disconnect}>
            Hang up
          </Button>
        </div>
      </section>

      {bookOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg border border-border bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold">Book appointment</h2>
            <form onSubmit={submitVisit} className="mt-4 grid gap-3">
              <Input
                value={visitForm.title}
                onChange={(e) => setVisitForm({ ...visitForm, title: e.target.value })}
                placeholder="Visit title"
                required
              />
              <select
                value={visitForm.division}
                onChange={(e) =>
                  setVisitForm({
                    ...visitForm,
                    division: e.target.value as "SERVICE" | "INSTALL",
                  })
                }
                className={selectClass}
              >
                <option value="SERVICE">Service</option>
                <option value="INSTALL">Install</option>
              </select>
              <Input
                type="date"
                value={visitForm.date}
                onChange={(e) => setVisitForm({ ...visitForm, date: e.target.value })}
                required
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="time"
                  value={visitForm.startTime}
                  onChange={(e) => setVisitForm({ ...visitForm, startTime: e.target.value })}
                  required
                />
                <Input
                  type="time"
                  value={visitForm.endTime}
                  onChange={(e) => setVisitForm({ ...visitForm, endTime: e.target.value })}
                  required
                />
              </div>
              <select
                value={visitForm.serviceAreaId}
                onChange={(e) => setVisitForm({ ...visitForm, serviceAreaId: e.target.value })}
                className={selectClass}
                required
              >
                <option value="">Service area</option>
                {filterOptions.serviceAreas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <select
                value={visitForm.assignedUserId}
                onChange={(e) => setVisitForm({ ...visitForm, assignedUserId: e.target.value })}
                className={selectClass}
              >
                <option value="">Unassigned</option>
                {filterOptions.employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setBookOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "Booking..." : "Book visit"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <TransferDialog
        open={transferOpen}
        onOpenChange={setTransferOpen}
        onTransfer={transfer}
      />
    </div>
  );
}
