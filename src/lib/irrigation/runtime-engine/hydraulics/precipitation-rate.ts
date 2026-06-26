import type { IrrigationType } from "../../types";
import {
  defaultPrecipRate,
  getCatalogEntry,
} from "../manufacturer/nozzle-catalog";

const GPM_TO_PR_FACTOR = 96.3;

/** Map technician irrigation efficiency score (1–10) to distribution uniformity (0.40–0.85). */
export function duFromEfficiencyScore(score: number | null | undefined): number | null {
  if (score == null || !Number.isFinite(score)) return null;
  const clamped = Math.max(1, Math.min(10, Math.round(score)));
  return Math.round((0.4 + ((clamped - 1) * 0.45) / 9) * 1000) / 1000;
}

export function resolveDistributionUniformity(
  irrigationType: IrrigationType,
  efficiencyScore: number | null | undefined
): number {
  return duFromEfficiencyScore(efficiencyScore) ?? getCatalogEntry(irrigationType).defaultDU;
}

export function calculatePrecipitationRate(
  totalGpm: number,
  irrigatedSqFt: number | null | undefined,
  irrigationType: IrrigationType
): { precipRateInHr: number; source: "calculated" | "catalog" } {
  if (totalGpm > 0 && irrigatedSqFt != null && irrigatedSqFt > 0) {
    return {
      precipRateInHr:
        Math.round(((GPM_TO_PR_FACTOR * totalGpm) / irrigatedSqFt) * 1000) / 1000,
      source: "calculated",
    };
  }
  return {
    precipRateInHr: defaultPrecipRate(irrigationType),
    source: "catalog",
  };
}

export function resolveZoneGpm(
  irrigationType: IrrigationType,
  nozzleCount: number | null | undefined,
  estimatedGpm: number | null | undefined,
  nozzleGpm: number | null | undefined
): number {
  if (estimatedGpm != null && estimatedGpm > 0) {
    return Math.round(estimatedGpm * 100) / 100;
  }
  const count = Math.max(1, nozzleCount ?? 1);
  const perHead = nozzleGpm ?? getCatalogEntry(irrigationType).defaultGpmPerHead;
  return Math.round(count * perHead * 100) / 100;
}
