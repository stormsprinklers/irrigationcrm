"use client";

import { Input } from "@/components/ui/input";
import {
  IRRIGATION_TYPES,
  SHADE_LEVELS,
  SLOPE_LEVELS,
  SOIL_TYPES,
  VEGETATION_TYPES,
} from "@/lib/irrigation/constants";
import { calculateZoneSchedule } from "@/lib/irrigation/runtime";
import type {
  IrrigationType,
  ShadeLevel,
  SlopeLevel,
  SoilType,
  VegetationType,
} from "@/lib/irrigation/types";

export type ZoneAttributes = {
  vegetationType?: string | null;
  shadeLevel?: string | null;
  slopeLevel?: string | null;
  soilType?: string | null;
  irrigationType?: string | null;
  nozzleCount?: number | null;
  baseRuntimeMinutes?: number | null;
};

type Props = {
  zoneName: string;
  attributes: ZoneAttributes;
  onChange: (attrs: ZoneAttributes) => void;
  disabled?: boolean;
  showRuntime?: boolean;
};

const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export function defaultZoneAttributes(): Required<
  Pick<
    ZoneAttributes,
    | "vegetationType"
    | "shadeLevel"
    | "slopeLevel"
    | "soilType"
    | "irrigationType"
    | "nozzleCount"
  >
> {
  return {
    vegetationType: "grass",
    shadeLevel: "full_sun",
    slopeLevel: "flat",
    soilType: "loam",
    irrigationType: "spray",
    nozzleCount: 4,
  };
}

export function IrrigationZoneAttributesPanel({
  zoneName,
  attributes,
  onChange,
  disabled = false,
  showRuntime = true,
}: Props) {
  const vegetationType = (attributes.vegetationType ?? "grass") as VegetationType;
  const shadeLevel = (attributes.shadeLevel ?? "full_sun") as ShadeLevel;
  const slopeLevel = (attributes.slopeLevel ?? "flat") as SlopeLevel;
  const soilType = (attributes.soilType ?? "loam") as SoilType;
  const irrigationType = (attributes.irrigationType ?? "spray") as IrrigationType;
  const nozzleCount = attributes.nozzleCount ?? 4;

  const schedule = calculateZoneSchedule({
    vegetationType,
    irrigationType,
    shadeLevel,
    soilType,
    slopeLevel,
  });

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
      <p className="text-sm font-medium">{zoneName} — zone attributes</p>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Vegetation</label>
        <select
          value={vegetationType}
          onChange={(e) => onChange({ ...attributes, vegetationType: e.target.value })}
          disabled={disabled}
          className={selectClassName}
        >
          {VEGETATION_TYPES.map((v) => (
            <option key={v.value} value={v.value}>
              {v.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Shade</label>
          <select
            value={shadeLevel}
            onChange={(e) => onChange({ ...attributes, shadeLevel: e.target.value })}
            disabled={disabled}
            className={selectClassName}
          >
            {SHADE_LEVELS.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Slope</label>
          <select
            value={slopeLevel}
            onChange={(e) => onChange({ ...attributes, slopeLevel: e.target.value })}
            disabled={disabled}
            className={selectClassName}
          >
            {SLOPE_LEVELS.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Soil</label>
          <select
            value={soilType}
            onChange={(e) => onChange({ ...attributes, soilType: e.target.value })}
            disabled={disabled}
            className={selectClassName}
          >
            {SOIL_TYPES.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          Irrigation / watering type
        </label>
        <select
          value={irrigationType}
          onChange={(e) => onChange({ ...attributes, irrigationType: e.target.value })}
          disabled={disabled}
          className={selectClassName}
        >
          {IRRIGATION_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Nozzle count</label>
        <Input
          type="number"
          min={1}
          value={nozzleCount}
          onChange={(e) =>
            onChange({ ...attributes, nozzleCount: Number(e.target.value) || 1 })
          }
          disabled={disabled}
        />
      </div>

      {showRuntime ? (
        <p className="text-xs text-muted-foreground">
          Suggested runtime: {schedule.adjustedRuntimeMinutes} min · {schedule.daysLabel}
        </p>
      ) : null}
    </div>
  );
}
