"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { PortalShell } from "./PortalShell";
import { blobProxyUrl } from "@/lib/blob/urls";
import { PortalSlotPicker } from "./PortalSlotPicker";

type VisitDetail = {
  id: string;
  title: string;
  status: string;
  startAt: string | null;
  endAt: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  technician: { name: string; photoUrl: string | null; title: string | null } | null;
};

export function PortalVisitDetail({ slug, visitId }: { slug: string; visitId: string }) {
  const router = useRouter();
  const [me, setMe] = useState<{ company: { name: string; emailLogoUrl: string | null; features: Record<string, boolean> } } | null>(null);
  const [visit, setVisit] = useState<VisitDetail | null>(null);
  const [policies, setPolicies] = useState({ rescheduleLeadHours: 24, cancelLeadHours: 24 });
  const [checklists, setChecklists] = useState<Array<{ id: string; name: string; items: unknown[] }>>([]);
  const [rescheduling, setRescheduling] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{ startAt: string; endAt: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const [meRes, visitRes] = await Promise.all([
      fetch("/api/portal/me"),
      fetch(`/api/portal/visits/${visitId}`),
    ]);
    const meData = await meRes.json();
    const visitData = await visitRes.json();
    setMe(meData);
    setVisit(visitData.visit);
    setPolicies(visitData.policies);

    if (meData.company?.features?.checklists) {
      const clRes = await fetch(`/api/portal/checklists?visitId=${visitId}`);
      if (clRes.ok) {
        const clData = await clRes.json();
        setChecklists(clData.checklists ?? []);
      }
    }
  }, [visitId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function cancelVisit() {
    if (!confirm("Cancel this visit?")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/portal/visits/${visitId}/cancel`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to cancel");
      toast.success("Visit cancelled");
      router.push(`/portal/${slug}/visits`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel");
    } finally {
      setLoading(false);
    }
  }

  async function reschedule() {
    if (!selectedSlot) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/portal/visits/${visitId}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selectedSlot),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to reschedule");
      toast.success("Visit rescheduled");
      setRescheduling(false);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reschedule");
    } finally {
      setLoading(false);
    }
  }

  if (!me || !visit) return <p className="text-sm text-muted-foreground">Loading...</p>;

  const canModify = ["SCHEDULED", "UNSCHEDULED"].includes(visit.status);
  const address = [visit.address, visit.city, visit.state, visit.zip].filter(Boolean).join(", ");

  return (
    <PortalShell slug={slug} companyName={me.company.name} emailLogoUrl={me.company.emailLogoUrl} features={me.company.features as never}>
      <div className="space-y-6">
        <Link href={`/portal/${slug}/visits`} className="text-sm text-primary hover:underline">
          ← Back to visits
        </Link>
        <div>
          <h1 className="text-2xl font-semibold">{visit.title}</h1>
          <p className="text-sm text-muted-foreground capitalize">{visit.status.toLowerCase().replace("_", " ")}</p>
          {visit.startAt ? (
            <p className="mt-2">{format(new Date(visit.startAt), "EEEE, MMMM d · h:mm a")}</p>
          ) : null}
          {address ? <p className="text-sm text-muted-foreground">{address}</p> : null}
        </div>

        {visit.technician ? (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-white p-4">
            {visit.technician.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={blobProxyUrl(visit.technician.photoUrl)} alt="" className="h-12 w-12 rounded-full object-cover" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-sm font-medium">
                {visit.technician.name.charAt(0)}
              </div>
            )}
            <div>
              <p className="font-medium">{visit.technician.name}</p>
              {visit.technician.title ? (
                <p className="text-sm text-muted-foreground">{visit.technician.title}</p>
              ) : (
                <p className="text-sm text-muted-foreground">Your technician</p>
              )}
            </div>
          </div>
        ) : null}

        {checklists.length > 0 ? (
          <section className="rounded-lg border border-border bg-white p-4">
            <h2 className="font-medium">Service checklists</h2>
            {checklists.map((cl) => (
              <div key={cl.id} className="mt-3">
                <p className="text-sm font-medium">{cl.name}</p>
                <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                  {(cl.items as Array<{ label: string; response: unknown }>).map((item, i) => (
                    <li key={i}>
                      {item.label}: {item.response != null ? String(JSON.stringify(item.response)) : "—"}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ) : null}

        {canModify && me.company.features.jobs ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setRescheduling(!rescheduling)} disabled={loading}>
              Reschedule
            </Button>
            <Button variant="destructive" onClick={() => void cancelVisit()} disabled={loading}>
              Cancel visit
            </Button>
          </div>
        ) : null}

        {rescheduling ? (
          <div className="rounded-lg border border-border bg-white p-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Reschedule requires at least {policies.rescheduleLeadHours} hours before the visit.
            </p>
            <PortalSlotPicker selected={selectedSlot} onSelect={setSelectedSlot} />
            <Button onClick={() => void reschedule()} disabled={!selectedSlot || loading}>
              Confirm new time
            </Button>
          </div>
        ) : null}
      </div>
    </PortalShell>
  );
}
