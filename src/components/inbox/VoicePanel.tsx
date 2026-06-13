"use client";

import { useEffect, useState } from "react";
import { Phone, PhoneOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BlockContactAction } from "@/components/inbox/BlockContactAction";
import type { InboxScope } from "@/lib/inbox/types";

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

type CallDetail = {
  id: string;
  toNumber: string;
  fromNumber: string;
  recordingUrl?: string | null;
  transcript?: string | null;
  customer?: { id: string; name: string; phone?: string | null; email?: string | null } | null;
};

export function VoicePanel({
  scope,
  selectedCallId,
}: {
  scope: InboxScope;
  selectedCallId: string | null;
}) {
  const [phone, setPhone] = useState("");
  const [calling, setCalling] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [callDetail, setCallDetail] = useState<CallDetail | null>(null);

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
    fetch(`/api/inbox/voice/history?scope=${scope === "customers" ? "external" : "internal"}`)
      .then((r) => r.json())
      .then((calls: CallDetail[]) => {
        setCallDetail(calls.find((c) => c.id === selectedCallId) ?? null);
      });
  }, [selectedCallId, scope]);

  async function handleCall(toNumber: string, customerId?: string) {
    setCalling(true);
    const res = await fetch("/api/inbox/voice/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: toNumber,
        customerId,
        scope: scope === "customers" ? "external" : "internal",
      }),
    });
    setCalling(false);

    if (!res.ok) {
      const data = await res.json();
      toast.error(data.error ?? "Failed to place call");
      return;
    }

    toast.success("Call initiated");
  }

  if (selectedCallId && callDetail) {
    return (
      <div className="flex h-full flex-col p-6">
        <h3 className="text-lg font-semibold">Call details</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {callDetail.fromNumber} → {callDetail.toNumber}
        </p>
        {callDetail.recordingUrl && (
          <div className="mt-4">
            <p className="mb-2 text-sm font-medium">Recording</p>
            <audio controls className="w-full" src={callDetail.recordingUrl}>
              <track kind="captions" />
            </audio>
          </div>
        )}
        {callDetail.transcript && (
          <div className="mt-4 flex-1">
            <p className="mb-2 text-sm font-medium">Transcript</p>
            <ScrollArea className="h-48 rounded-md border border-border p-3">
              <p className="text-sm leading-relaxed text-muted-foreground">
                {callDetail.transcript}
              </p>
            </ScrollArea>
          </div>
        )}
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
                    {emp.photoUrl ? <AvatarImage src={emp.photoUrl} alt={emp.name} /> : null}
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
                  disabled={!emp.phone || calling}
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
      <h3 className="text-lg font-semibold">Dialer</h3>
      <p className="mb-4 text-sm text-muted-foreground">Call a customer by number</p>
      <Input
        placeholder="(801) 555-0123"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        className="mb-4 text-lg"
      />
      <div className="grid grid-cols-3 gap-2 mb-4">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map((digit) => (
          <Button
            key={digit}
            variant="outline"
            className="h-12 text-lg"
            type="button"
            onClick={() => setPhone((p) => p + digit)}
          >
            {digit}
          </Button>
        ))}
      </div>
      <div className="flex gap-2">
        <Button
          className="flex-1"
          disabled={!phone || calling}
          onClick={() => handleCall(phone)}
        >
          <Phone className="h-4 w-4" />
          Call
        </Button>
        <Button variant="outline" onClick={() => setPhone("")}>
          <PhoneOff className="h-4 w-4" />
        </Button>
      </div>
      {scope === "customers" && phone && (
        <div className="mt-4 flex justify-end">
          <BlockContactAction phone={phone} name={phone} />
        </div>
      )}
    </div>
  );
}
