"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PortalOfferCard, type PortalOfferCardData } from "./PortalOfferCard";
import { PortalPropertySection } from "./PortalPropertySection";
import { PortalShell, PortalPropertyLink } from "./PortalShell";

type MeResponse = {
  customer: { name: string };
  properties: Array<{
    id: string;
    name: string;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  }>;
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
  const [offers, setOffers] = useState<PortalOfferCardData[]>([]);
  const [balanceDue, setBalanceDue] = useState(0);
  const [overdueTotal, setOverdueTotal] = useState(0);

  useEffect(() => {
    Promise.all([
      fetch("/api/portal/me").then((r) => r.json()),
      fetch("/api/portal/visits").then((r) => (r.ok ? r.json() : { upcoming: [] })),
      fetch("/api/portal/offers").then((r) => (r.ok ? r.json() : { offers: [] })),
      fetch("/api/portal/billing-summary").then((r) => (r.ok ? r.json() : null)),
    ]).then(([meData, visitsData, offersData, billing]) => {
      setMe(meData);
      setUpcoming(visitsData.upcoming?.slice(0, 3) ?? []);
      setOffers(offersData.offers?.slice(0, 2) ?? []);
      if (billing) {
        setBalanceDue(Number(billing.totalBalanceDue) || 0);
        setOverdueTotal(Number(billing.overdueTotal) || 0);
      }
    });
  }, []);

  if (!me) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  const singleProperty = me.properties.length === 1 ? me.properties[0] : null;
  const bannerAmount = overdueTotal > 0 ? overdueTotal : balanceDue;
  const bannerLabel = overdueTotal > 0 ? "overdue" : "due";

  return (
    <PortalShell slug={slug} companyName={me.company.name} emailLogoUrl={me.company.emailLogoUrl} features={me.company.features as never}>
      <div className="space-y-6">
        {bannerAmount > 0 ? (
          <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-amber-950">
                You have{" "}
                {bannerAmount.toLocaleString(undefined, {
                  style: "currency",
                  currency: "USD",
                })}{" "}
                {bannerLabel}
              </p>
              <p className="mt-1 text-sm text-amber-900/80">
                From open invoices and maintenance billing.
              </p>
            </div>
            <Button asChild className="shrink-0 bg-storm-coral hover:bg-storm-coral/90">
              <Link href={`/portal/${slug}/pay`}>Pay your balance</Link>
            </Button>
          </div>
        ) : null}

        <div>
          <h1 className="font-display text-2xl uppercase tracking-wide text-storm-navy">
            Welcome, {me.customer.name.split(" ")[0]}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Your service account at a glance.</p>
        </div>

        {singleProperty ? (
          <PortalPropertySection
            propertyId={singleProperty.id}
            property={singleProperty}
            features={{
              rachio: Boolean(me.company.features.rachio),
              irrigation: Boolean(me.company.features.irrigation),
            }}
            showTitle
          />
        ) : null}

        {upcoming.length > 0 && me.company.features.jobs ? (
          <section className="portal-card">
            <h2 className="portal-section-title">Upcoming visits</h2>
            <ul className="mt-3 space-y-2">
              {upcoming.map((v) => (
                <li key={v.id}>
                  <Link
                    href={`/portal/${slug}/visits/${v.id}`}
                    className="text-sm font-medium text-storm-sky hover:text-storm-coral hover:underline"
                  >
                    {v.title}
                    {v.startAt ? ` — ${format(new Date(v.startAt), "MMM d, h:mm a")}` : ""}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {offers.length > 0 && me.company.features.offers ? (
          <section className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="portal-section-title">Offers for you</h2>
              <Link href={`/portal/${slug}/offers`} className="text-sm font-medium text-storm-sky hover:underline">
                View all
              </Link>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {offers.map((o) => (
                <li key={o.id}>
                  <PortalOfferCard offer={o} compact />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {me.properties.length > 1 ? (
          <section className="portal-card">
            <h2 className="portal-section-title">Your properties</h2>
            <ul className="mt-3 space-y-2">
              {me.properties.map((p) => (
                <li key={p.id}>
                  <PortalPropertyLink slug={slug} propertyId={p.id} label={p.name} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {me.company.features.allowSchedule ? (
          <Button asChild className="bg-storm-coral hover:bg-storm-coral/90">
            <Link href={`/portal/${slug}/visits/schedule`}>Schedule a visit</Link>
          </Button>
        ) : null}

        {(me.company.phone || me.company.supportEmail) && (
          <p className="text-xs text-muted-foreground">
            Need help?{" "}
            {me.company.phone ? (
              <a href={`tel:${me.company.phone}`} className="text-storm-sky hover:underline">
                {me.company.phone}
              </a>
            ) : null}
            {me.company.phone && me.company.supportEmail ? " · " : null}
            {me.company.supportEmail ? (
              <a href={`mailto:${me.company.supportEmail}`} className="text-storm-sky hover:underline">
                {me.company.supportEmail}
              </a>
            ) : null}
          </p>
        )}
      </div>
    </PortalShell>
  );
}
