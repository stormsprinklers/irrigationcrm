"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PortalPropertySection } from "./PortalPropertySection";
import { PortalShell } from "./PortalShell";

export function PortalPropertyView({ slug, propertyId }: { slug: string; propertyId: string }) {
  const [me, setMe] = useState<{
    company: { name: string; emailLogoUrl: string | null; features: Record<string, boolean> };
    properties: Array<{
      id: string;
      name: string;
      address: string | null;
      city: string | null;
      state: string | null;
      zip: string | null;
    }>;
  } | null>(null);

  const property = me?.properties.find((p) => p.id === propertyId);

  useEffect(() => {
    fetch("/api/portal/me")
      .then((r) => r.json())
      .then(setMe);
  }, []);

  if (!me || !property) return <p className="text-sm text-muted-foreground">Loading...</p>;

  return (
    <PortalShell slug={slug} companyName={me.company.name} emailLogoUrl={me.company.emailLogoUrl} features={me.company.features as never}>
      <div className="space-y-6">
        <Link href={`/portal/${slug}`} className="text-sm font-medium text-storm-sky hover:underline">
          ← Back to home
        </Link>
        <PortalPropertySection
          propertyId={propertyId}
          property={property}
          features={{ rachio: Boolean(me.company.features.rachio) }}
          showTitle
        />
      </div>
    </PortalShell>
  );
}
