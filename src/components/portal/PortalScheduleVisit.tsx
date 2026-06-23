"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { PortalShell } from "./PortalShell";
import { PortalSlotPicker } from "./PortalSlotPicker";

export function PortalScheduleVisit({ slug }: { slug: string }) {
  const router = useRouter();
  const [me, setMe] = useState<{
    company: { name: string; emailLogoUrl: string | null; features: Record<string, boolean> };
    properties: Array<{ id: string; name: string }>;
  } | null>(null);
  const [propertyId, setPropertyId] = useState("");
  const [title, setTitle] = useState("Service appointment");
  const [notes, setNotes] = useState("");
  const [selectedSlot, setSelectedSlot] = useState<{ startAt: string; endAt: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/portal/me")
      .then((r) => r.json())
      .then((data) => {
        setMe(data);
        if (data.properties?.[0]) setPropertyId(data.properties[0].id);
      });
  }, []);

  async function submit() {
    if (!selectedSlot) return;
    setLoading(true);
    try {
      const res = await fetch("/api/portal/visits/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, title, notes, ...selectedSlot }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to schedule");
      toast.success("Visit scheduled");
      router.push(`/portal/${slug}/visits/${data.visitId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to schedule");
    } finally {
      setLoading(false);
    }
  }

  if (!me) return <p className="text-sm text-muted-foreground">Loading...</p>;

  return (
    <PortalShell slug={slug} companyName={me.company.name} emailLogoUrl={me.company.emailLogoUrl} features={me.company.features as never}>
      <div className="space-y-6">
        <Link href={`/portal/${slug}/visits`} className="text-sm text-primary hover:underline">
          ← Back to visits
        </Link>
        <h1 className="text-2xl font-semibold">Schedule a visit</h1>

        {me.properties.length > 1 ? (
          <div>
            <label className="text-sm font-medium">Property</label>
            <select
              className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
            >
              {me.properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div>
          <label className="text-sm font-medium">Reason for visit</label>
          <Input className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div>
          <label className="text-sm font-medium">Notes (optional)</label>
          <Input className="mt-1" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <PortalSlotPicker selected={selectedSlot} onSelect={setSelectedSlot} />

        <Button onClick={() => void submit()} disabled={!selectedSlot || loading}>
          {loading ? "Scheduling..." : "Schedule visit"}
        </Button>
      </div>
    </PortalShell>
  );
}
