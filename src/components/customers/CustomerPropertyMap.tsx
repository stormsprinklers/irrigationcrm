"use client";

import Link from "next/link";
import { MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  buildGoogleMapsUrl,
  buildMapsPlaceEmbedUrl,
  buildMapsStreetViewEmbedUrl,
  formatAddressQuery,
  formatCustomerAddress,
  getGoogleMapsApiKey,
} from "@/lib/customers/maps";

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

export function CustomerPropertyMap({ title = "Property location", location }: Props) {
  const formatted = formatCustomerAddress(location);
  const query = formatAddressQuery(location);
  const apiKey = getGoogleMapsApiKey();
  const placeEmbed = query ? buildMapsPlaceEmbedUrl(query) : null;
  const streetEmbed = query ? buildMapsStreetViewEmbedUrl(query) : null;
  const mapsLink = buildGoogleMapsUrl(location);

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

        {!apiKey ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            Set <code className="text-xs">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> to show map and
            Street View embeds.
          </p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {placeEmbed ? (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Map
                </p>
                <div className="overflow-hidden rounded-lg border">
                  <iframe
                    title="Property map"
                    src={placeEmbed}
                    className="h-56 w-full border-0"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    allowFullScreen
                  />
                </div>
              </div>
            ) : null}
            {streetEmbed ? (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Street view
                </p>
                <div className="overflow-hidden rounded-lg border">
                  <iframe
                    title="Property street view"
                    src={streetEmbed}
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
