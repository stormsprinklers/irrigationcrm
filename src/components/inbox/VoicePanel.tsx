"use client";

import { useEffect, useState } from "react";
import { Phone, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CallDetailView } from "@/components/voice/CallDetailView";
import { VoiceDialer } from "@/components/voice/VoiceDialer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useVoiceDevice } from "@/contexts/VoiceDeviceProvider";
import type { CallHistoryDetail } from "@/lib/voice/call-history";
import type { InboxScope } from "@/lib/inbox/types";
import { blobProxyUrl } from "@/lib/blob/urls";

type Employee = {
  id: string;
  name: string;
  phone?: string | null;
  email: string;
  role: string;
  color?: string | null;
  photoUrl?: string | null;
  title?: string | null;
};

type QueueEntry = {
  id: string;
  fromNumber: string;
  toNumber: string;
  queueEnteredAt: string | null;
  customer?: { id: string; name: string; phone?: string | null } | null;
};

export function VoicePanel({
  scope,
  selectedCallId,
  initialPhone,
  initialCustomerId,
  initialName,
}: {
  scope: InboxScope;
  selectedCallId: string | null;
  initialPhone?: string | null;
  initialCustomerId?: string | null;
  initialName?: string | null;
}) {
  const { ready, connect, activeCall } = useVoiceDevice();
  const [calling, setCalling] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [callDetail, setCallDetail] = useState<CallHistoryDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [queue, setQueue] = useState<QueueEntry[]>([]);

  useEffect(() => {
    if (scope === "team") {
      fetch("/api/inbox/internal/messages?scope=team")
        .then((r) => r.json())
        .then(setEmployees)
        .catch(() => {});
    }
  }, [scope]);

  useEffect(() => {
    if (!selectedCallId) {
      setCallDetail(null);
      return;
    }
    setLoadingDetail(true);
    fetch(`/api/voice/calls/history/${selectedCallId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setCallDetail(data))
      .catch(() => setCallDetail(null))
      .finally(() => setLoadingDetail(false));
  }, [selectedCallId]);

  useEffect(() => {
    if (scope !== "customers") return;
    const loadQueue = () => {
      fetch("/api/voice/queue")
        .then((r) => r.json())
        .then((data) => setQueue(data.queue ?? []))
        .catch(() => {});
    };
    loadQueue();
    const timer = setInterval(loadQueue, 5000);
    return () => clearInterval(timer);
  }, [scope]);

  async function handleCall(toNumber: string, customerId?: string) {
    if (!ready) {
      toast.error("Softphone not ready — check Twilio Voice settings");
      return;
    }
    if (activeCall) {
      toast.error("Already on a call");
      return;
    }

    setCalling(true);
    try {
      await connect(toNumber, customerId);
      toast.success("Calling…");
    } catch {
      toast.error("Failed to place call");
    } finally {
      setCalling(false);
    }
  }

  async function acceptQueue(id: string) {
    const res = await fetch(`/api/voice/queue/${id}/accept`, { method: "POST" });
    if (!res.ok) {
      toast.error("Failed to accept queued call");
      return;
    }
    toast.success("Connecting queued caller…");
    setQueue((q) => q.filter((e) => e.id !== id));
  }

  if (selectedCallId) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-border px-4 py-3">
          <h3 className="font-semibold">Call details</h3>
        </div>
        <ScrollArea className="flex-1">
          {loadingDetail ? (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          ) : !callDetail ? (
            <p className="p-4 text-sm text-muted-foreground">Call not found.</p>
          ) : (
            <div className="p-4">
              <CallDetailView detail={callDetail} />
            </div>
          )}
        </ScrollArea>
      </div>
    );
  }

  if (scope === "team") {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-border p-4">
          <h3 className="font-semibold">Team directory</h3>
          <p className="text-sm text-muted-foreground">Click to call a team member</p>
        </div>
        <ScrollArea className="flex-1">
          <ul>
            {employees.map((emp) => (
              <li key={emp.id} className="flex items-center justify-between border-b border-border px-4 py-3">
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    {emp.photoUrl ? (
                      <AvatarImage src={blobProxyUrl(emp.photoUrl)} alt={emp.name} />
                    ) : null}
                    <AvatarFallback
                      style={{ backgroundColor: emp.color ?? "#64748B", color: "#fff" }}
                      className="text-xs"
                    >
                      {emp.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{emp.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {emp.title ?? emp.role} · {emp.phone ?? "No phone"}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!emp.phone || calling || !ready}
                  onClick={() => emp.phone && handleCall(emp.phone)}
                >
                  <Phone className="h-4 w-4" />
                  Call
                </Button>
              </li>
            ))}
          </ul>
        </ScrollArea>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col p-6">
      {queue.length > 0 && (
        <div className="mb-4 rounded-lg border border-border bg-muted/30 p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <Users className="h-4 w-4" />
            Queue ({queue.length})
          </div>
          <ul className="space-y-2">
            {queue.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between text-sm">
                <span>{entry.customer?.name ?? entry.fromNumber}</span>
                <Button size="sm" variant="outline" onClick={() => void acceptQueue(entry.id)}>
                  Accept
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <VoiceDialer
        initialPhone={initialPhone}
        initialCustomerId={initialCustomerId}
        initialName={initialName}
      />
    </div>
  );
}
