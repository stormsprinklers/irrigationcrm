import type { IrrigationType } from "./types";
import {
  getDefaultGpmPerHead,
  gphToGpm,
  gpmToGph,
} from "./manufacturer-data";
import { IRRIGATION_TYPES, VALVE_CAPACITY_GPM } from "./constants";

export function getDefaultNozzleGpm(irrigationType: IrrigationType): number {
  return getDefaultGpmPerHead(irrigationType);
}

export function getDefaultNozzleLabel(irrigationType: IrrigationType): string {
  if (irrigationType === "drip") {
    const gpm = getDefaultGpmPerHead("drip");
    return `${gpm} GPM (${gpmToGph(gpm)} GPH per emitter)`;
  }
  const spec = IRRIGATION_TYPES.find((t) => t.value === irrigationType);
  return `${getDefaultGpmPerHead(irrigationType)} GPM (${spec?.label ?? irrigationType} typical)`;
}

export function calculateZoneGpm(nozzleCount: number, nozzleGpm: number): number {
  return Math.round(nozzleCount * nozzleGpm * 100) / 100;
}

export function isOverValveCapacity(totalGpm: number, capacity = VALVE_CAPACITY_GPM): boolean {
  return totalGpm > capacity;
}

export function calculatePropertyTotalGpm(zoneGpms: number[]): number {
  return Math.round(zoneGpms.reduce((sum, gpm) => sum + gpm, 0) * 100) / 100;
}

export type GpmWarning = {
  zoneName: string;
  gpm: number;
  message: string;
};

export function getGpmWarnings(
  zones: { name: string; estimated_gpm: number | null }[]
): GpmWarning[] {
  return zones
    .filter((z) => z.estimated_gpm != null && isOverValveCapacity(z.estimated_gpm))
    .map((z) => ({
      zoneName: z.name,
      gpm: z.estimated_gpm!,
      message: `Zone exceeds typical valve capacity (${VALVE_CAPACITY_GPM} GPM)`,
    }));
}

export { gphToGpm, gpmToGph };
