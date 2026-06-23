"use client";

import { useEffect, useState } from "react";
import { PortalShell } from "./PortalShell";
import { Button } from "@/components/ui/button";

type Offer = {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
};

export function PortalOffersList({ slug }: { slug: string }) {
  const [me, setMe] = useState<{ company: { name: string; emailLogoUrl: string | null; features: Record<string, boolean> } } | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);

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
    <PortalShell slug={slug} companyName={me.company.name} emailLogoUrl={me.company.emailLogoUrl} features={me.company.features as never}>
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Offers & rebates</h1>
        {offers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No offers available right now.</p>
        ) : (
          <ul className="space-y-4">
            {offers.map((o) => (
              <li key={o.id} className="rounded-lg border border-border bg-white p-4">
                {o.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={o.imageUrl} alt="" className="mb-3 max-h-40 w-full rounded object-cover" />
                ) : null}
                <p className="font-medium">{o.title}</p>
                {o.description ? <p className="mt-1 text-sm text-muted-foreground">{o.description}</p> : null}
                {o.ctaUrl ? (
                  <Button asChild className="mt-3" size="sm">
                    <a href={o.ctaUrl} target="_blank" rel="noopener noreferrer">
                      {o.ctaLabel ?? "Learn more"}
                    </a>
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </PortalShell>
  );
}
