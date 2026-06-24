"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Props = {
  customerId: string;
  propertyId: string;
  propertyName: string;
  aerialImageUrl?: string | null;
  propertyDiagramUrl?: string | null;
  irrigationMapStatus?: string | null;
};

function setupUrl(customerId: string, propertyId: string) {
  return `/customers/${customerId}?tab=properties&propertyId=${propertyId}`;
}

export function VisitIrrigationMap({
  customerId,
  propertyId,
  propertyName,
  aerialImageUrl,
  propertyDiagramUrl,
  irrigationMapStatus,
}: Props) {
  const mapImageUrl = propertyDiagramUrl || aerialImageUrl;
  const editHref = setupUrl(customerId, propertyId);

  if (!mapImageUrl) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3">
        <div>
          <p className="text-sm font-medium">Irrigation map</p>
          <p className="text-sm text-muted-foreground">
            No map for {propertyName} yet. Set one up so techs see zones on site.
          </p>
        </div>
        <Button size="sm" asChild>
          <Link href={editHref}>
            <Plus className="mr-1.5 h-4 w-4" />
            Set up irrigation map
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">Irrigation map</h2>
          <span className="text-sm text-muted-foreground">· {propertyName}</span>
          {irrigationMapStatus === "PUBLISHED" ? (
            <Badge variant="secondary" className="text-[10px]">
              Published
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px]">
              Draft
            </Badge>
          )}
        </div>
        <Button size="sm" variant="outline" asChild>
          <Link href={editHref}>Edit map</Link>
        </Button>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={mapImageUrl}
        alt={`Irrigation map for ${propertyName}`}
        className="max-h-80 w-full object-cover"
      />
    </section>
  );
}
