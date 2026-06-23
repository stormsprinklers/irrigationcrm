"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import Link from "next/link";
import { PortalShell } from "./PortalShell";

type Visit = {
  id: string;
  title: string;
  status: string;
  startAt: string | null;
  endAt: string | null;
  technician: { name: string; photoUrl: string | null; title: string | null } | null;
};

export function PortalVisitsList({ slug }: { slug: string }) {
  const [me, setMe] = useState<{ company: { name: string; emailLogoUrl: string | null; features: Record<string, boolean> } } | null>(null);
  const [upcoming, setUpcoming] = useState<Visit[]>([]);
  const [past, setPast] = useState<Visit[]>([]);

  useEffect(() => {
    Promise.all([
      fetch("/api/portal/me").then((r) => r.json()),
      fetch("/api/portal/visits").then((r) => r.json()),
    ]).then(([meData, visitsData]) => {
      setMe(meData);
      setUpcoming(visitsData.upcoming ?? []);
      setPast(visitsData.past ?? []);
    });
  }, []);

  if (!me) return <p className="text-sm text-muted-foreground">Loading...</p>;

  return (
    <PortalShell slug={slug} companyName={me.company.name} emailLogoUrl={me.company.emailLogoUrl} features={me.company.features as never}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Visits</h1>
          {me.company.features.allowSchedule ? (
            <Link href={`/portal/${slug}/visits/schedule`} className="text-sm text-primary hover:underline">
              Schedule new visit
            </Link>
          ) : null}
        </div>

        <section>
          <h2 className="text-sm font-medium text-muted-foreground">Upcoming</h2>
          {upcoming.length === 0 ? (
            <p className="mt-2 text-sm">No upcoming visits.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {upcoming.map((v) => (
                <li key={v.id} className="rounded-lg border border-border bg-white p-4">
                  <Link href={`/portal/${slug}/visits/${v.id}`} className="font-medium hover:underline">
                    {v.title}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {v.startAt ? format(new Date(v.startAt), "EEEE, MMM d · h:mm a") : "Not scheduled"}
                  </p>
                  {v.technician ? (
                    <p className="mt-1 text-xs text-muted-foreground">Technician: {v.technician.name}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="text-sm font-medium text-muted-foreground">Past</h2>
          {past.length === 0 ? (
            <p className="mt-2 text-sm">No past visits.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {past.slice(0, 20).map((v) => (
                <li key={v.id} className="rounded-lg border border-border bg-white p-4">
                  <Link href={`/portal/${slug}/visits/${v.id}`} className="font-medium hover:underline">
                    {v.title}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {v.startAt ? format(new Date(v.startAt), "MMM d, yyyy") : v.status}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </PortalShell>
  );
}
