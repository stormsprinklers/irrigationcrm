import type { IrrigationType } from "../../types";

/**
 * Manufacturer reference data for precipitation rate and flow.
 * Sources: Rain Bird VAN series, Hunter MP Rotator, Rain Bird 5000 rotors, Rain Bird XFS drip.
 */
export type NozzleCatalogEntry = {
  irrigationType: IrrigationType;
  label: string;
  defaultGpmPerHead: number;
  defaultPrecipRateInHr: number;
  defaultDU: number;
  operatingPsi: number;
  notes: string;
};

export const NOZZLE_CATALOG: Record<IrrigationType, NozzleCatalogEntry> = {
  spray: {
    irrigationType: "spray",
    label: "Fixed spray (Rain Bird VAN)",
    defaultGpmPerHead: 1.85,
    defaultPrecipRateInHr: 1.58,
    defaultDU: 0.55,
    operatingPsi: 30,
    notes: "Rain Bird 15VAN @ 30 psi, 180° arc, square spacing",
  },
  rotary: {
    irrigationType: "rotary",
    label: "MP Rotator (Hunter)",
    defaultGpmPerHead: 0.48,
    defaultPrecipRateInHr: 0.43,
    defaultDU: 0.7,
    operatingPsi: 40,
    notes: "Hunter MP2000 @ 180°/40 psi; matched precip ~0.4 in/hr",
  },
  rotor: {
    irrigationType: "rotor",
    label: "Gear-driven rotor (Rain Bird 5000)",
    defaultGpmPerHead: 3.09,
    defaultPrecipRateInHr: 0.4,
    defaultDU: 0.65,
    operatingPsi: 45,
    notes: "Rain Bird 5000 3.0 nozzle @ 45 psi, half-circle square spacing",
  },
  drip: {
    irrigationType: "drip",
    label: "Drip emitter (Rain Bird XFS)",
    defaultGpmPerHead: 0.01,
    defaultPrecipRateInHr: 0.43,
    defaultDU: 0.85,
    operatingPsi: 25,
    notes: "Rain Bird XFS 0.6 GPH emitters, 18\"×18\" spacing",
  },
  bubbler: {
    irrigationType: "bubbler",
    label: "Bubbler / flood basin",
    defaultGpmPerHead: 0.25,
    defaultPrecipRateInHr: 0.2,
    defaultDU: 0.85,
    operatingPsi: 30,
    notes: "Point-source flood/bubbler; low precip for basin fill",
  },
};

export function getCatalogEntry(type: IrrigationType): NozzleCatalogEntry {
  return NOZZLE_CATALOG[type];
}

export function defaultGpmPerHead(type: IrrigationType): number {
  return NOZZLE_CATALOG[type].defaultGpmPerHead;
}

export function defaultPrecipRate(type: IrrigationType): number {
  return NOZZLE_CATALOG[type].defaultPrecipRateInHr;
}

export function defaultDU(type: IrrigationType): number {
  return NOZZLE_CATALOG[type].defaultDU;
}
