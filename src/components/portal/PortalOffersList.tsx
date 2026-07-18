"use client";

import { useEffect, useState } from "react";
import { PortalShell } from "./PortalShell";
import { PortalOfferCard, type PortalOfferCardData } from "./PortalOfferCard";

export function PortalOffersList({ slug }: { slug: string }) {
  const [me, setMe] = useState<{
    company: { name: string; emailLogoUrl: string | null; features: Record<string, boolean> };
  } | null>(null);
  const [offers, setOffers] = useState<PortalOfferCardData[]>([]);

  useEffect(() => {
    Promise.all([
      fetch("/api/portal/me").then((r) => r.json()),
      fetch("/api/portal/offers").then((r) => r.json()),
    ]).then(([meData, offersData]) => {
      setMe(meData);
      setOffers(offersData.offers ?? []);
    });
  }, []);

  if (!me) return <p className="text-sm text-muted-foreground">Loading...</p>;

  return (
    <PortalShell
      slug={slug}
      companyName={me.company.name}
      emailLogoUrl={me.company.emailLogoUrl}
      features={me.company.features as never}
    >
      <div className="space-y-5">
        <div>
          <h1 className="font-display text-2xl font-bold text-storm-navy">Offers & rebates</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Current promotions available for your account.
          </p>
        </div>
        {offers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No offers available right now.</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {offers.map((o) => (
              <li key={o.id}>
                <PortalOfferCard offer={o} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </PortalShell>
  );
}
