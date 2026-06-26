"use client";

import { Input } from "@/components/ui/input";
import {
  IRRIGATION_TYPES,
  SHADE_LEVELS,
  SLOPE_LEVELS,
  SOIL_TYPES,
  VEGETATION_TYPES,
} from "@/lib/irrigation/constants";
import type {
  IrrigationType,
  ShadeLevel,
  SlopeLevel,
  SoilType,
  VegetationType,
} from "@/lib/irrigation/types";

export type EstablishmentStage = "NORMAL" | "NEW_SOD" | "NEW_SEED";

export type ZoneAttributes = {
  vegetationType?: string | null;
  shadeLevel?: string | null;
  slopeLevel?: string | null;
  soilType?: string | null;
  irrigationType?: string | null;
  nozzleCount?: number | null;
  baseRuntimeMinutes?: number | null;
  irrigatedSqFt?: number | null;
  irrigationEfficiencyScore?: number | null;
  establishmentStage?: EstablishmentStage | string | null;
  nozzleGpm?: number | null;
};

type Props = {
  zoneName: string;
  attributes: ZoneAttributes;
  onChange: (attrs: ZoneAttributes) => void;
  disabled?: boolean;
  runtimePreview?: {
    weeklyRuntimeMinutes: number;
    runtimePerEventMinutes: number;
    gallonsPerWeek: number;
    daysPerWeek: number;
  } | null;
};

const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const ESTABLISHMENT_OPTIONS: { value: EstablishmentStage; label: string }[] = [
  { value: "NORMAL", label: "Established" },
  { value: "NEW_SOD", label: "New sod (temporary)" },
  { value: "NEW_SEED", label: "New seed (temporary)" },
];

export function defaultZoneAttributes(): Required<
  Pick<
    ZoneAttributes,
    | "vegetationType"
    | "shadeLevel"
    | "slopeLevel"
    | "soilType"
    | "irrigationType"
    | "nozzleCount"
    | "establishmentStage"
  >
> {
  return {
    vegetationType: "grass",
    shadeLevel: "full_sun",
    slopeLevel: "flat",
    soilType: "loam",
    irrigationType: "spray",
    nozzleCount: 4,
    establishmentStage: "NORMAL",
  };
}

export function IrrigationZoneAttributesPanel({
  zoneName,
  attributes,
  onChange,
  disabled = false,
  runtimePreview,
}: Props) {
  const vegetationType = (attributes.vegetationType ?? "grass") as VegetationType;
  const shadeLevel = (attributes.shadeLevel ?? "full_sun") as ShadeLevel;
  const slopeLevel = (attributes.slopeLevel ?? "flat") as SlopeLevel;
  const soilType = (attributes.soilType ?? "loam") as SoilType;
  const irrigationType = (attributes.irrigationType ?? "spray") as IrrigationType;
  const nozzleCount = attributes.nozzleCount ?? 4;
  const establishmentStage = (attributes.establishmentStage ?? "NORMAL") as EstablishmentStage;

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

      <div className="grid gap-2 sm:grid-cols-2">
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
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Irrigated sq ft
          </label>
          <Input
            type="number"
            min={0}
            placeholder="Optional"
            value={attributes.irrigatedSqFt ?? ""}
            onChange={(e) =>
              onChange({
                ...attributes,
                irrigatedSqFt: e.target.value ? Number(e.target.value) : null,
              })
            }
            disabled={disabled}
          />
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Irrigation efficiency (1–10)
          </label>
          <Input
            type="number"
            min={1}
            max={10}
            placeholder="6 = typical"
            value={attributes.irrigationEfficiencyScore ?? ""}
            onChange={(e) =>
              onChange({
                ...attributes,
                irrigationEfficiencyScore: e.target.value ? Number(e.target.value) : null,
              })
            }
            disabled={disabled}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Establishment
          </label>
          <select
            value={establishmentStage}
            onChange={(e) =>
              onChange({ ...attributes, establishmentStage: e.target.value as EstablishmentStage })
            }
            disabled={disabled}
            className={selectClassName}
          >
            {ESTABLISHMENT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {runtimePreview ? (
        <div className="rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">ET-based estimate:</span>{" "}
            {runtimePreview.runtimePerEventMinutes} min/event · {runtimePreview.daysPerWeek} days/wk
            · {runtimePreview.weeklyRuntimeMinutes} min/wk · ~{runtimePreview.gallonsPerWeek} gal/wk
          </p>
        </div>
      ) : null}
    </div>
  );
}
