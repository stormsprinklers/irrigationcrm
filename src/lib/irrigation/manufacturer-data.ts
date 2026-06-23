import type { IrrigationType, VegetationType } from "./types";

/**
 * Manufacturer reference data for flow and precipitation rates.
 *
 * Sources:
 * - Rain Bird VAN Series (15VAN @ 30 psi): ~1.58 in/hr, 1.85 GPM @ 180° arc
 * - Hunter MP Rotator (standard line): matched ~0.4 in/hr precip
 * - Rain Bird 5000 rotor (3.0 nozzle @ 45 psi, half-circle square spacing): ~0.37–0.43 in/hr
 * - Rain Bird XFS dripline (0.6 GPH, 18"×18" spacing): ~0.43 in/hr
 */

export type ManufacturerSpec = {
  /** Typical precipitation rate (in/hr) at head-to-head / matched spacing */
  precipRateInHr: number;
  /** Default flow per device in GPM (drip: per 0.6 GPH emitter ≈ 0.01 GPM) */
  defaultGpmPerHead: number;
  /** Distribution uniformity / application efficiency for runtime calc */
  applicationEfficiency: number;
  operatingPsi: number;
  notes: string;
};

export const MANUFACTURER_SPECS: Record<IrrigationType, ManufacturerSpec> = {
  spray: {
    precipRateInHr: 1.58,
    defaultGpmPerHead: 1.85,
    applicationEfficiency: 0.75,
    operatingPsi: 30,
    notes: "Rain Bird 15VAN @ 30 psi, 180° arc, square spacing",
  },
  rotary: {
    precipRateInHr: 0.43,
    defaultGpmPerHead: 0.48,
    applicationEfficiency: 0.85,
    operatingPsi: 40,
    notes: "Hunter MP Rotator matched precip ~0.4 in/hr; MP2000 ~0.48 GPM @ 180°/40 psi",
  },
  rotor: {
    precipRateInHr: 0.4,
    defaultGpmPerHead: 3.09,
    applicationEfficiency: 0.8,
    operatingPsi: 45,
    notes: "Rain Bird 5000 3.0 nozzle @ 45 psi, half-circle square spacing",
  },
  drip: {
    precipRateInHr: 0.43,
    defaultGpmPerHead: 0.01,
    applicationEfficiency: 0.9,
    operatingPsi: 25,
    notes: "Rain Bird XFS 0.6 GPH emitters, 18\"×18\" spacing (~0.43 in/hr)",
  },
  bubbler: {
    precipRateInHr: 0.2,
    defaultGpmPerHead: 0.25,
    applicationEfficiency: 0.85,
    operatingPsi: 30,
    notes: "Point-source flood/bubbler; effective low precip for basin fill",
  },
};

/** Target net application depth per irrigation cycle (inches) by vegetation type */
export const TARGET_DEPTH_INCHES: Record<VegetationType, number> = {
  grass: 0.4,
  shrubs: 0.3,
  trees: 0.5,
  flower_bed: 0.25,
};

/** Typical peak-season irrigation days per week (Utah residential baseline) */
export const CYCLES_PER_WEEK: Record<VegetationType, number> = {
  grass: 3,
  shrubs: 2,
  trees: 1,
  flower_bed: 2,
};

export function getManufacturerSpec(type: IrrigationType): ManufacturerSpec {
  return MANUFACTURER_SPECS[type];
}

export function getDefaultGpmPerHead(type: IrrigationType): number {
  return MANUFACTURER_SPECS[type].defaultGpmPerHead;
}

export function getPrecipitationRate(type: IrrigationType): number {
  return MANUFACTURER_SPECS[type].precipRateInHr;
}

/** Convert emitter GPH to GPM for drip entry fields */
export function gphToGpm(gph: number): number {
  return Math.round((gph / 60) * 1000) / 1000;
}

export function gpmToGph(gpm: number): number {
  return Math.round(gpm * 60 * 10) / 10;
}
