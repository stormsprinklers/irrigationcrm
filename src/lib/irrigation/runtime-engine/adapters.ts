import type {
  EstablishmentStage,
  GrassSeason,
  PropertyLocationContext,
  PropertyScheduleSettings,
  ZoneRuntimeInput,
} from "./types";
import type {
  IrrigationType,
  ShadeLevel,
  SlopeLevel,
  SoilType,
  VegetationType,
} from "../types";

type MapZoneRecord = {
  id: string;
  name: string;
  sortOrder: number;
  vegetationType?: string | null;
  shadeLevel?: string | null;
  slopeLevel?: string | null;
  soilType?: string | null;
  irrigationType?: string | null;
  nozzleCount?: number | null;
  estimatedGpm?: number | null;
  irrigatedSqFt?: number | null;
  irrigationEfficiencyScore?: number | null;
  establishmentStage?: string | null;
  nozzleGpm?: number | null;
};

type PropertyRecord = {
  grassSeason?: string | null;
  droughtRestrictionsActive?: boolean | null;
  cycleSoakEnabled?: boolean | null;
  etoOverrideInches?: number | null;
  address?: string | null;
  city?: string | null;
};

export function zoneInputFromMapZone(
  zone: MapZoneRecord,
  stationNumber?: number
): ZoneRuntimeInput {
  return {
    id: zone.id,
    name: zone.name,
    sortOrder: zone.sortOrder,
    stationNumber: stationNumber ?? zone.sortOrder + 1,
    vegetationType: (zone.vegetationType as VegetationType) ?? null,
    shadeLevel: (zone.shadeLevel as ShadeLevel) ?? null,
    slopeLevel: (zone.slopeLevel as SlopeLevel) ?? null,
    soilType: (zone.soilType as SoilType) ?? null,
    irrigationType: (zone.irrigationType as IrrigationType) ?? null,
    nozzleCount: zone.nozzleCount ?? null,
    estimatedGpm: zone.estimatedGpm ?? null,
    irrigatedSqFt: zone.irrigatedSqFt ?? null,
    irrigationEfficiencyScore: zone.irrigationEfficiencyScore ?? null,
    establishmentStage: (zone.establishmentStage as EstablishmentStage) ?? "NORMAL",
    nozzleGpm: zone.nozzleGpm ?? null,
  };
}

export function propertySettingsFromRecord(
  property: PropertyRecord
): PropertyScheduleSettings {
  return {
    grassSeason: (property.grassSeason as GrassSeason) ?? "COOL",
    droughtRestrictionsActive: property.droughtRestrictionsActive ?? true,
    cycleSoakEnabled: property.cycleSoakEnabled ?? false,
    etoOverrideInches: property.etoOverrideInches ?? null,
  };
}

export function propertyLocationFromRecord(
  property: Pick<PropertyRecord, "address" | "city">
): PropertyLocationContext {
  return {
    address: property.address ?? null,
    city: property.city ?? null,
  };
}
