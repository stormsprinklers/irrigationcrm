"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Calendar, Phone, User, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { CustomerNameWithBadge } from "@/components/customers/CustomerNameWithBadge";
import { CallerIdDetails } from "@/components/voice/CallerIdDetails";
import { InboundLineCard } from "@/components/voice/InboundLineCard";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PhoneText } from "@/components/ui/PhoneText";
import { formatPhoneDisplay } from "@/lib/inbox/phone";
import { useVoiceDevice } from "@/contexts/VoiceDeviceProvider";
import { TransferDialog } from "@/components/voice/TransferDialog";
import { VoiceDialer } from "@/components/voice/VoiceDialer";
import { CsrCallHistoryPanel } from "@/components/voice/CsrCallHistoryPanel";
import { formatCallerVisitDate } from "@/lib/voice/caller-info";
import { createCallDraftVisit, createDraftCustomer } from "@/lib/schedule/create-draft";
import { cn } from "@/lib/utils";

type QueueEntry = {
  id: string;
  fromNumber: string;
  queueEnteredAt: string | null;
  customer?: {
    id: string;
    name: string;
    phone?: string | null;
    city?: string | null;
    mostRecentVisitAt?: string | null;
  } | null;
};

type CustomerDetail = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  mostRecentVisitAt?: string | null;
  doNotService?: boolean;
  lifetimeValue?: number | null;
  outstandingBalance?: number | null;
  propertyAddress?: string | null;
  recentVisits?: Array<{
    id: string;
    title: string;
    startAt: string;
    status: string;
    total: number;
    balanceDue: number;
    technicianName: string | null;
  }>;
};

export function CsrDeskPanel({
  onVisitBooked,
}: {
  onVisitBooked?: (visitId: string) => void;
}) {
  const router = useRouter();
  const { ready, activeCall, disconnect, transfer, toggleHold, notifyVisitBooked } = useVoiceDevice();
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [needsScheduling, setNeedsScheduling] = useState<
    Array<{
      id: string;
      customer: { id: string; name: string; phone: string | null };
      property: { id: string; name: string; address: string | null; city: string | null } | null;
      total: number;
      installDurationDays: number | null;
    }>
  >([]);

  const callerPhone = activeCall?.remoteNumber ?? activeCall?.callerInfo?.phone;
  const knownCustomerId = activeCall?.callerInfo?.customerId ?? customer?.id;

  useEffect(() => {
    fetch("/api/estimates/needs-scheduling")
      .then((r) => r.json())
      .then((data) => setNeedsScheduling(data.estimates ?? []))
      .catch(() => {});
  }, []);

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

  async function acceptQueue(id: string) {
    if (activeCall) {
      toast.error("Finish your current call before picking up the queue");
      return;
    }
    const res = await fetch(`/api/voice/queue/${id}/accept`, { method: "POST" });
    if (!res.ok) {
      toast.error("Failed to pick up queued caller");
      return;
    }
    toast.success("Connecting queued caller…");
    setQueue((q) => q.filter((e) => e.id !== id));
  }

  useEffect(() => {
    if (!callerPhone) {
      setCustomer(null);
      return;
    }
    fetch(`/api/voice/caller-lookup?phone=${encodeURIComponent(callerPhone)}`)
      .then((r) => r.json())
      .then((lookup) => {
        if (!lookup.customerId) {
          setCustomer(null);
          return;
        }
        return fetch(`/api/customers/${lookup.customerId}`)
          .then((r) => r.json())
          .then((data) => {
            if (data.error) {
              setCustomer({
                id: lookup.customerId,
                name: lookup.name ?? "Customer",
                phone: lookup.phone,
                city: lookup.city,
                mostRecentVisitAt: lookup.mostRecentVisitAt,
                doNotService: lookup.doNotService,
                lifetimeValue: lookup.lifetimeValue,
                outstandingBalance: lookup.outstandingBalance,
                propertyAddress: lookup.propertyAddress,
                recentVisits: lookup.recentVisits ?? [],
              });
              return;
            }
            setCustomer({
              id: data.id,
              name: data.name,
              phone: data.phone,
              email: data.email,
              city: lookup.city ?? data.city,
              mostRecentVisitAt: lookup.mostRecentVisitAt,
              doNotService: data.doNotService,
              lifetimeValue: lookup.lifetimeValue,
              outstandingBalance: lookup.outstandingBalance,
              propertyAddress: lookup.propertyAddress,
              recentVisits: lookup.recentVisits ?? [],
            });
          });
      })
      .catch(() => setCustomer(null));
  }, [callerPhone]);

  async function bookAppointment() {
    if (!activeCall || creating) return;
    if (customer?.doNotService || activeCall.callerInfo?.doNotService) {
      toast.error("This customer is marked DO NOT SERVICE and cannot be scheduled");
      return;
    }
    setCreating(true);
    try {
      const visit = await createCallDraftVisit({
        customerId: knownCustomerId,
        callSessionId: activeCall.sessionId,
        callerName: customer?.name ?? activeCall.callerInfo?.name,
        callerPhone: callerPhone,
      });
      notifyVisitBooked(visit.id);
      onVisitBooked?.(visit.id);
      router.push(`/visits/${visit.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create appointment");
    } finally {
      setCreating(false);
    }
  }

  async function createCustomerFromCall() {
    if (!activeCall || creating) return;
    if (knownCustomerId) {
      router.push(`/customers/${knownCustomerId}?edit=1`);
      return;
    }
    setCreating(true);
    try {
      const created = await createDraftCustomer({
        name: customer?.name ?? activeCall.callerInfo?.name,
        phone: callerPhone,
      });
      router.push(`/customers/${created.id}?edit=1`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create customer");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 pb-4">
      <div className="space-y-3">
      {needsScheduling.length > 0 ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <h3 className="mb-2 flex items-center gap-2 font-semibold text-amber-900">
            <Calendar className="h-4 w-4" /> Needs scheduling ({needsScheduling.length})
          </h3>
          <ul className="space-y-1 text-sm">
            {needsScheduling.slice(0, 5).map((est) => (
              <li key={est.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {est.customer.name}
                  {est.property?.city ? ` · ${est.property.city}` : ""}
                  {est.installDurationDays ? ` · ${est.installDurationDays}-day install` : ""}
                </span>
                <Button variant="link" className="h-auto p-0" asChild>
                  <Link href="/schedule/needs-scheduling">Schedule</Link>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <div className="grid shrink-0 gap-3 lg:grid-cols-2 xl:grid-cols-4">
      <section className={cn("rounded-lg border bg-white p-3", queue.length ? "border-amber-300" : "border-border")}>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Phone className="h-4 w-4" /> Queue ({queue.length})
          {queue.length > 0 ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900">
              Waiting
            </span>
          ) : null}
        </h3>
        <ScrollArea className="h-24">
          <ul className="space-y-2 text-sm">
            {queue.map((entry) => (
              <li key={entry.id} className="rounded border border-border p-2">
                <p className="font-medium">
                  {entry.customer?.name ?? formatPhoneDisplay(entry.fromNumber)}
                </p>
                {entry.customer ? (
                  <p className="text-xs text-muted-foreground">
                    {[entry.customer.city, entry.customer.mostRecentVisitAt
                      ? `Last visit ${formatCallerVisitDate(entry.customer.mostRecentVisitAt)}`
                      : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  <PhoneText phone={entry.fromNumber} empty="" />
                </p>
                <Button
                  size="sm"
                  className="mt-2"
                  disabled={Boolean(activeCall)}
                  onClick={() => void acceptQueue(entry.id)}
                >
                  {activeCall ? "Finish current call first" : "Pick up"}
                </Button>
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

      <section className="rounded-lg border border-border bg-white p-3">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <User className="h-4 w-4" /> Customer
        </h3>
        {activeCall ? (
          <div className="space-y-2 text-sm">
            <CustomerNameWithBadge
              name={
                customer?.name ??
                activeCall.callerInfo?.name ??
                callerPhone ??
                "Unknown caller"
              }
              doNotService={customer?.doNotService ?? activeCall.callerInfo?.doNotService}
              nameClassName="text-lg font-semibold"
            />
            <CallerIdDetails
              callerInfo={
                activeCall.callerInfo ??
                (customer?.id
                  ? {
                      phone: callerPhone ?? "",
                      customerId: customer.id,
                      city: customer.city,
                      mostRecentVisitAt: customer.mostRecentVisitAt,
                    }
                  : null)
              }
            />
            <p className="text-muted-foreground">
              <PhoneText phone={callerPhone} empty="" />
            </p>
            {activeCall.direction === "inbound" ? (
              <InboundLineCard info={activeCall.inboundLine} />
            ) : null}
            {customer?.email ? <p>{customer.email}</p> : null}
            {customer?.propertyAddress ? (
              <p className="text-xs text-muted-foreground">{customer.propertyAddress}</p>
            ) : null}
            {customer?.lifetimeValue != null ? (
              <p className="text-xs">
                <span className="text-muted-foreground">LTV:</span>{" "}
                <span className="font-medium">
                  {new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: "USD",
                  }).format(customer.lifetimeValue)}
                </span>
                {customer.outstandingBalance != null && customer.outstandingBalance > 0 ? (
                  <span className="text-muted-foreground">
                    {" "}
                    · Due{" "}
                    {new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: "USD",
                    }).format(customer.outstandingBalance)}
                  </span>
                ) : null}
              </p>
            ) : null}
            {customer?.recentVisits && customer.recentVisits.length > 0 ? (
              <div className="space-y-1 border-t border-border pt-2">
                <p className="text-xs font-medium text-muted-foreground">Recent appointments</p>
                <ul className="space-y-1.5">
                  {customer.recentVisits.slice(0, 4).map((v) => (
                    <li key={v.id} className="text-xs leading-snug">
                      <Link href={`/visits/${v.id}`} className="font-medium text-primary hover:underline">
                        {new Date(v.startAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </Link>
                      <span className="text-muted-foreground">
                        {" "}
                        · {v.technicianName ?? "Unassigned"}
                        {v.balanceDue > 0
                          ? ` · ${new Intl.NumberFormat("en-US", {
                              style: "currency",
                              currency: "USD",
                            }).format(v.balanceDue)} due`
                          : v.total > 0
                            ? ` · ${new Intl.NumberFormat("en-US", {
                                style: "currency",
                                currency: "USD",
                              }).format(v.total)}`
                            : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
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

      <section className="rounded-lg border border-border bg-white p-3">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Phone className="h-4 w-4" /> Outbound dialer
        </h3>
        <VoiceDialer compact />
      </section>

      <section className="rounded-lg border border-border bg-white p-3">
        <h3 className="mb-2 text-sm font-semibold">Actions</h3>
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            disabled={!activeCall || creating || customer?.doNotService}
            onClick={() => void bookAppointment()}
          >
            <Calendar className="mr-2 h-4 w-4" />
            {creating ? "Opening…" : "Book appointment"}
          </Button>
          <Button
            variant="outline"
            disabled={!activeCall || creating}
            onClick={() => void createCustomerFromCall()}
          >
            <UserPlus className="mr-2 h-4 w-4" />
            {knownCustomerId ? "Open customer" : "New customer"}
          </Button>
          <Button
            variant="outline"
            disabled={!activeCall}
            onClick={() => void toggleHold()}
          >
            {activeCall?.onHold ? "Resume call" : "Place on hold"}
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
      </div>

      <TransferDialog
        open={transferOpen}
        onOpenChange={setTransferOpen}
        onTransfer={transfer}
      />
      </div>

      <CsrCallHistoryPanel className="min-h-[36rem]" />
    </div>
  );
}
