import type { IrrigationType, ShadeLevel, SlopeLevel, SoilType, VegetationType } from "@/lib/irrigation/types";

type DesignHydrozone = {
  id: string;
  name: string;
  zoneId?: string;
  hydrozoneType?: string;
  sunExposure?: string;
  slopePercent?: number;
  soilType?: string;
};

type DesignZone = { id: string; name: string; hydrozoneIds?: string[] };

type DesignSnapshot = {
  zones?: DesignZone[];
  hydrozones?: DesignHydrozone[];
  heads?: Array<{ zoneId: string }>;
};

function mapVegetation(type?: string): VegetationType {
  switch (type) {
    case "SHRUBS":
      return "shrubs";
    case "TREES":
      return "trees";
    case "DRIP":
    case "GARDEN":
      return "flower_bed";
    default:
      return "grass";
  }
}

function mapShade(exposure?: string): ShadeLevel {
  switch (exposure) {
    case "PART_SHADE":
      return "some_shade";
    case "FULL_SHADE":
      return "lots_of_shade";
    default:
      return "full_sun";
  }
}

function mapSlope(percent?: number): SlopeLevel {
  const p = percent ?? 0;
  if (p >= 15) return "steep";
  if (p >= 5) return "moderate";
  return "flat";
}

function mapSoil(type?: string): SoilType {
  switch (type) {
    case "CLAY":
      return "clay";
    case "SAND":
      return "sand";
    default:
      return "loam";
  }
}

function mapIrrigation(type?: string): IrrigationType {
  return type === "DRIP" ? "drip" : "spray";
}

export function buildWizardSeedFromDesignSnapshot(snapshot: DesignSnapshot) {
  const zones = snapshot.zones ?? [];
  const hydrozones = snapshot.hydrozones ?? [];
  const heads = snapshot.heads ?? [];

  if (zones.length === 0 && hydrozones.length === 0) return null;

  const seedZones = (zones.length > 0 ? zones : [{ id: "z1", name: "Zone 1", hydrozoneIds: hydrozones.map((h) => h.id) }]).map(
    (zone) => {
      const linkedHz = hydrozones.filter(
        (h) => h.zoneId === zone.id || zone.hydrozoneIds?.includes(h.id)
      );
      const primary = linkedHz[0];
      const headCount = heads.filter((h) => h.zoneId === zone.id).length;

      return {
        name: zone.name,
        vegetationType: mapVegetation(primary?.hydrozoneType),
        shadeLevel: mapShade(primary?.sunExposure),
        slopeLevel: mapSlope(primary?.slopePercent),
        soilType: mapSoil(primary?.soilType),
        irrigationType: mapIrrigation(primary?.hydrozoneType),
        nozzleCount: Math.max(1, headCount || linkedHz.length * 4),
      };
    }
  );

  return {
    zoneCount: seedZones.length,
    zones: seedZones,
    shutoffValveLocation: "",
    controllerLocation: "",
  };
}
