"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { PortalShell } from "./PortalShell";

type MeResponse = {
  customer: { name: string };
  properties: Array<{ id: string; name: string }>;
  company: {
    name: string;
    phone: string | null;
    supportEmail: string | null;
    emailLogoUrl: string | null;
    features: Record<string, boolean>;
  };
};

type Visit = {
  id: string;
  title: string;
  startAt: string | null;
  status: string;
};

export function PortalDashboard({ slug }: { slug: string }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [upcoming, setUpcoming] = useState<Visit[]>([]);
  const [offers, setOffers] = useState<Array<{ id: string; title: string; description: string | null }>>([]);

  useEffect(() => {
    Promise.all([
      fetch("/api/portal/me").then((r) => r.json()),
      fetch("/api/portal/visits").then((r) => (r.ok ? r.json() : { upcoming: [] })),
      fetch("/api/portal/offers").then((r) => (r.ok ? r.json() : { offers: [] })),
    ]).then(([meData, visitsData, offersData]) => {
      setMe(meData);
      setUpcoming(visitsData.upcoming?.slice(0, 3) ?? []);
      setOffers(offersData.offers?.slice(0, 2) ?? []);
    });
  }, []);

  if (!me) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  return (
    <PortalShell slug={slug} companyName={me.company.name} emailLogoUrl={me.company.emailLogoUrl} features={me.company.features as never}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Welcome, {me.customer.name}</h1>
          <p className="text-sm text-muted-foreground">Manage your service history and account.</p>
        </div>

        {upcoming.length > 0 && me.company.features.jobs ? (
          <section className="rounded-lg border border-border bg-white p-4">
            <h2 className="font-medium">Upcoming visits</h2>
            <ul className="mt-3 space-y-2">
              {upcoming.map((v) => (
                <li key={v.id}>
                  <Link href={`/portal/${slug}/visits/${v.id}`} className="text-sm hover:underline">
                    {v.title}
                    {v.startAt ? ` — ${format(new Date(v.startAt), "MMM d, h:mm a")}` : ""}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {offers.length > 0 && me.company.features.offers ? (
          <section className="rounded-lg border border-border bg-white p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-medium">Offers for you</h2>
              <Link href={`/portal/${slug}/offers`} className="text-sm text-primary hover:underline">
                View all
              </Link>
            </div>
            <ul className="mt-3 space-y-2">
              {offers.map((o) => (
                <li key={o.id} className="text-sm">
                  <p className="font-medium">{o.title}</p>
                  {o.description ? <p className="text-muted-foreground">{o.description}</p> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {me.properties.length > 0 ? (
          <section className="rounded-lg border border-border bg-white p-4">
            <h2 className="font-medium">Your properties</h2>
            <ul className="mt-3 space-y-2">
              {me.properties.map((p) => (
                <li key={p.id}>
                  <Link href={`/portal/${slug}/properties/${p.id}`} className="text-sm text-primary hover:underline">
                    {p.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {me.company.features.allowSchedule ? (
          <Button asChild>
            <Link href={`/portal/${slug}/visits/schedule`}>Schedule a visit</Link>
          </Button>
        ) : null}

        {(me.company.phone || me.company.supportEmail) && (
          <p className="text-xs text-muted-foreground">
            Need help?{" "}
            {me.company.phone ? <a href={`tel:${me.company.phone}`}>{me.company.phone}</a> : null}
            {me.company.phone && me.company.supportEmail ? " · " : null}
            {me.company.supportEmail ? (
              <a href={`mailto:${me.company.supportEmail}`}>{me.company.supportEmail}</a>
            ) : null}
          </p>
        )}
      </div>
    </PortalShell>
  );
}
