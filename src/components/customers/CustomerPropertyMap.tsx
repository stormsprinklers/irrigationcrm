"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { buildGoogleMapsUrl, formatAddressQuery, formatCustomerAddress } from "@/lib/customers/maps";

type AddressParts = {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

type Props = {
  title?: string;
  location: AddressParts;
};

type EmbedResponse = {
  configured: boolean;
  placeEmbed: string | null;
  streetEmbed: string | null;
};

export function CustomerPropertyMap({ title = "Property location", location }: Props) {
  const formatted = formatCustomerAddress(location);
  const query = formatAddressQuery(location);
  const mapsLink = buildGoogleMapsUrl(location);
  const [embeds, setEmbeds] = useState<EmbedResponse | null>(null);
  const [loading, setLoading] = useState(Boolean(query));

  useEffect(() => {
    if (!query) {
      setEmbeds(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetch(`/api/maps/embed?q=${encodeURIComponent(query)}`)
      .then((r) => r.json())
      .then((data: EmbedResponse) => setEmbeds(data))
      .catch(() => setEmbeds({ configured: false, placeEmbed: null, streetEmbed: null }))
      .finally(() => setLoading(false));
  }, [query]);

  if (!formatted) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No address on file.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{title}</CardTitle>
        {mapsLink ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={mapsLink} target="_blank" rel="noopener noreferrer">
              <MapPin className="mr-1 h-4 w-4" />
              Open in Maps
            </Link>
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{formatted}</p>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading map...
          </div>
        ) : !embeds?.configured ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            Set <code className="text-xs">GOOGLE_MAPS_API_KEY</code> on the server to show map and
            Street View embeds.
          </p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {embeds.placeEmbed ? (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Map
                </p>
                <div className="overflow-hidden rounded-lg border">
                  <iframe
                    title="Property map"
                    src={embeds.placeEmbed}
                    className="h-56 w-full border-0"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    allowFullScreen
                  />
                </div>
              </div>
            ) : null}
            {embeds.streetEmbed ? (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Street view
                </p>
                <div className="overflow-hidden rounded-lg border">
                  <iframe
                    title="Property street view"
                    src={embeds.streetEmbed}
                    className="h-56 w-full border-0"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    allowFullScreen
                  />
                </div>
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
