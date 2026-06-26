"use client";

import Link from "next/link";
import { PropertyIrrigationMapEditor } from "@/components/visits/PropertyIrrigationMapEditor";
import { ControllerProgramGuidePanel } from "@/components/irrigation/ControllerProgramGuidePanel";
import { Button } from "@/components/ui/button";

type VisitProperty = {
  id: string;
  name: string;
  aerialImageUrl?: string | null;
  propertyDiagramUrl?: string | null;
  irrigationMapStatus?: string | null;
};

type Props = {
  customerId: string;
  property: VisitProperty | null;
};

export function VisitIrrigationSection({ customerId, property }: Props) {
  if (!property) {
    return (
      <section className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-4">
        <h2 className="text-sm font-semibold">Property map &amp; programming</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          No property is linked to this visit yet. Add one on the customer profile to show the
          irrigation map and controller programming guide here.
        </p>
        <Button type="button" variant="outline" size="sm" className="mt-3" asChild>
          <Link href={`/customers/${customerId}?tab=properties`}>Open customer properties</Link>
        </Button>
      </section>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <PropertyIrrigationMapEditor
        customerId={customerId}
        propertyId={property.id}
        propertyName={property.name}
        aerialImageUrl={property.aerialImageUrl}
        propertyDiagramUrl={property.propertyDiagramUrl}
        irrigationMapStatus={property.irrigationMapStatus}
        allowInlineEdit
      />
      <ControllerProgramGuidePanel customerId={customerId} propertyId={property.id} />
    </div>
  );
}
