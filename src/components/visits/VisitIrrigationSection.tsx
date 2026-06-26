"use client";

import { PropertyIrrigationMapEditor } from "@/components/visits/PropertyIrrigationMapEditor";
import { ControllerProgramGuidePanel } from "@/components/irrigation/ControllerProgramGuidePanel";

type Props = {
  customerId: string;
  propertyId: string;
  propertyName: string;
  aerialImageUrl?: string | null;
  propertyDiagramUrl?: string | null;
  irrigationMapStatus?: string | null;
};

export function VisitIrrigationSection({
  customerId,
  propertyId,
  propertyName,
  aerialImageUrl,
  propertyDiagramUrl,
  irrigationMapStatus,
}: Props) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <PropertyIrrigationMapEditor
        customerId={customerId}
        propertyId={propertyId}
        propertyName={propertyName}
        aerialImageUrl={aerialImageUrl}
        propertyDiagramUrl={propertyDiagramUrl}
        irrigationMapStatus={irrigationMapStatus}
        allowInlineEdit
      />
      <ControllerProgramGuidePanel customerId={customerId} propertyId={propertyId} />
    </div>
  );
}
