"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

type PhoneNumberRow = {
  id: string;
  e164: string;
  friendlyName: string | null;
  numberType: string;
  isPrimary: boolean;
  trackingSource: string | null;
  callFlowId: string | null;
  assignedUserId: string | null;
  twilioSid: string | null;
  callFlow?: { id: string; name: string } | null;
  assignedUser?: { id: string; name: string } | null;
};

type CallFlowOption = { id: string; name: string };
type EmployeeOption = { id: string; name: string };

const NUMBER_TYPES = [
  { value: "PRIMARY", label: "Primary" },
  { value: "TRACKING", label: "Tracking" },
  { value: "AGENT_DIRECT", label: "Agent direct line" },
];

export default function VoiceNumbersPage() {
  const [tab, setTab] = useState<"list" | "buy">("list");
  const [numbers, setNumbers] = useState<PhoneNumberRow[]>([]);
  const [flows, setFlows] = useState<CallFlowOption[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [e164, setE164] = useState("");
  const [friendlyName, setFriendlyName] = useState("");
  const [callFlowId, setCallFlowId] = useState("");
  const [numberType, setNumberType] = useState("TRACKING");
  const [assignedUserId, setAssignedUserId] = useState("");
  const [trackingSource, setTrackingSource] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [areaCode, setAreaCode] = useState("801");
  const [searchResults, setSearchResults] = useState<Array<{ e164: string; locality?: string }>>([]);
  const [syncing, setSyncing] = useState(false);

  function load() {
    Promise.all([
      fetch("/api/settings/voice/numbers").then((r) => r.json()),
      fetch("/api/settings/voice/flows").then((r) => r.json()),
      fetch("/api/settings/employees?status=ACTIVE").then((r) => r.json()),
    ])
      .then(([nums, fl, emps]) => {
        if (nums?.error) {
          toast.error(nums.error);
          setNumbers([]);
        } else {
          setNumbers(Array.isArray(nums) ? nums : []);
        }
        setFlows(Array.isArray(fl) ? fl.map((f: CallFlowOption) => ({ id: f.id, name: f.name })) : []);
        setEmployees(Array.isArray(emps) ? emps.map((e: EmployeeOption) => ({ id: e.id, name: e.name })) : []);
      })
      .catch(() => toast.error("Failed to load numbers"));
  }

  useEffect(() => {
    load();
  }, []);

  async function addNumber(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/settings/voice/numbers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        e164,
        friendlyName,
        callFlowId: callFlowId || null,
        isPrimary,
        numberType,
        assignedUserId: assignedUserId || null,
        trackingSource: trackingSource || null,
      }),
    });
    if (!res.ok) {
      toast.error("Failed to add number");
      return;
    }
    setE164("");
    setFriendlyName("");
    load();
    toast.success("Number added");
  }

  async function syncFromTwilio() {
    setSyncing(true);
    try {
      const res = await fetch("/api/settings/voice/numbers/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Sync failed");
        return;
      }
      toast.success(`Imported ${data.imported}, updated ${data.updated}`);
      load();
    } finally {
      setSyncing(false);
    }
  }

  async function searchNumbers() {
    const res = await fetch(
      `/api/settings/voice/numbers/search?areaCode=${encodeURIComponent(areaCode)}`
    );
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? "Search failed");
      return;
    }
    setSearchResults(data.numbers ?? []);
  }

  async function purchaseNumber(phone: string) {
    const res = await fetch("/api/settings/voice/numbers/purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        e164: phone,
        friendlyName,
        numberType,
        callFlowId: callFlowId || null,
        trackingSource: trackingSource || null,
      }),
    });
    if (!res.ok) {
      const data = await res.json();
      toast.error(data.error ?? "Purchase failed");
      return;
    }
    toast.success("Number purchased");
    setTab("list");
    load();
  }

  async function updateNumber(id: string, patch: Partial<PhoneNumberRow>) {
    const res = await fetch(`/api/settings/voice/numbers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      toast.error("Update failed");
      return;
    }
    load();
  }

  async function deleteNumber(id: string, releaseTwilio: boolean) {
    const res = await fetch(
      `/api/settings/voice/numbers/${id}?releaseTwilio=${releaseTwilio}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      toast.error("Delete failed");
      return;
    }
    toast.success(releaseTwilio ? "Number released from Twilio" : "Number removed");
    load();
  }

  return (
    <ContentArea className="max-w-4xl">
      <PageHeader
        breadcrumb={["Settings", "Voice", "Numbers"]}
        title="Phone numbers"
        subtitle="Manage tracking numbers, assign call flows, and purchase from Twilio"
      />

      <div className="mb-4 flex gap-2">
        <Button variant={tab === "list" ? "default" : "outline"} onClick={() => setTab("list")}>
          Your numbers
        </Button>
        <Button variant={tab === "buy" ? "default" : "outline"} onClick={() => setTab("buy")}>
          Buy a number
        </Button>
        <Button variant="outline" onClick={syncFromTwilio} disabled={syncing}>
          {syncing ? "Syncing..." : "Import from Twilio"}
        </Button>
      </div>

      {tab === "buy" ? (
        <div className="space-y-4 rounded-lg border border-border bg-white p-6">
          <h3 className="font-semibold">Search available numbers</h3>
          <div className="flex gap-2">
            <Input
              placeholder="Area code"
              value={areaCode}
              onChange={(e) => setAreaCode(e.target.value)}
              className="max-w-[120px]"
            />
            <Button type="button" onClick={searchNumbers}>
              Search
            </Button>
          </div>
          <ul className="divide-y divide-border">
            {searchResults.map((n) => (
              <li key={n.e164} className="flex items-center justify-between py-3 text-sm">
                <span>
                  {n.e164}
                  {n.locality ? ` · ${n.locality}` : ""}
                </span>
                <Button size="sm" onClick={() => purchaseNumber(n.e164)}>
                  Buy
                </Button>
              </li>
            ))}
            {!searchResults.length && (
              <li className="py-3 text-muted-foreground">Search to see available numbers.</li>
            )}
          </ul>
        </div>
      ) : (
        <>
          <form onSubmit={addNumber} className="mb-8 space-y-4 rounded-lg border border-border bg-white p-6">
            <h3 className="font-semibold">Add number manually</h3>
            <Input placeholder="+18015550100" value={e164} onChange={(e) => setE164(e.target.value)} />
            <Input
              placeholder="Friendly name"
              value={friendlyName}
              onChange={(e) => setFriendlyName(e.target.value)}
            />
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={numberType}
              onChange={(e) => setNumberType(e.target.value)}
            >
              {NUMBER_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            {numberType === "TRACKING" && (
              <Input
                placeholder="Tracking source (e.g. Google Ads)"
                value={trackingSource}
                onChange={(e) => setTrackingSource(e.target.value)}
              />
            )}
            {numberType === "AGENT_DIRECT" && (
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={assignedUserId}
                onChange={(e) => setAssignedUserId(e.target.value)}
              >
                <option value="">Select employee</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            )}
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={callFlowId}
              onChange={(e) => setCallFlowId(e.target.value)}
            >
              <option value="">Default flow (ring agents)</option>
              {flows.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={isPrimary} onCheckedChange={(c) => setIsPrimary(Boolean(c))} />
              Primary caller ID
            </label>
            <Button type="submit">Add number</Button>
          </form>

          <ul className="divide-y divide-border rounded-lg border border-border bg-white">
            {numbers.map((n) => (
              <li key={n.id} className="space-y-3 p-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {n.friendlyName ?? n.e164}
                      {n.isPrimary ? (
                        <Badge className="ml-2" variant="secondary">
                          Primary
                        </Badge>
                      ) : null}
                    </p>
                    <p className="text-muted-foreground">
                      {n.e164} · {n.numberType}
                      {n.trackingSource ? ` · ${n.trackingSource}` : ""}
                    </p>
                    <p className="text-muted-foreground">
                      Flow: {n.callFlow?.name ?? "Default"}
                      {n.assignedUser ? ` · Agent: ${n.assignedUser.name}` : ""}
                      {n.twilioSid ? " · Twilio linked" : " · Manual entry"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        deleteNumber(n.id, Boolean(n.twilioSid))
                      }
                    >
                      {n.twilioSid ? "Release" : "Delete"}
                    </Button>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <select
                    className="h-9 rounded-md border border-input px-2 text-sm"
                    value={n.callFlowId ?? ""}
                    onChange={(e) =>
                      updateNumber(n.id, { callFlowId: e.target.value || null } as Partial<PhoneNumberRow>)
                    }
                  >
                    <option value="">Default flow</option>
                    {flows.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                  <select
                    className="h-9 rounded-md border border-input px-2 text-sm"
                    value={n.numberType}
                    onChange={(e) => updateNumber(n.id, { numberType: e.target.value } as Partial<PhoneNumberRow>)}
                  >
                    {NUMBER_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
              </li>
            ))}
            {!numbers.length && (
              <li className="p-4 text-muted-foreground">No phone numbers yet.</li>
            )}
          </ul>
        </>
      )}
    </ContentArea>
  );
}
