import type {
  IrrigationType,
  ShadeLevel,
  SlopeLevel,
  SoilType,
  VegetationType,
} from "./types";
import { getDefaultGpmPerHead } from "./manufacturer-data";

export const VEGETATION_TYPES: { value: VegetationType; label: string }[] = [
  { value: "grass", label: "Grass" },
  { value: "shrubs", label: "Shrubs" },
  { value: "trees", label: "Trees" },
  { value: "flower_bed", label: "Flower Bed" },
];

export const SHADE_LEVELS: { value: ShadeLevel; label: string }[] = [
  { value: "full_sun", label: "Full Sun" },
  { value: "some_shade", label: "Some Shade" },
  { value: "lots_of_shade", label: "Lots of Shade" },
];

export const SLOPE_LEVELS: { value: SlopeLevel; label: string }[] = [
  { value: "flat", label: "Flat" },
  { value: "moderate", label: "Moderate" },
  { value: "steep", label: "Steep" },
];

export const SOIL_TYPES: { value: SoilType; label: string }[] = [
  { value: "sand", label: "Sand" },
  { value: "clay", label: "Clay" },
  { value: "loam", label: "Loam" },
];

export const IRRIGATION_TYPES: {
  value: IrrigationType;
  label: string;
  defaultGpm: number;
  precipInHr: number;
}[] = [
  { value: "spray", label: "Spray", defaultGpm: getDefaultGpmPerHead("spray"), precipInHr: 1.58 },
  { value: "rotary", label: "Rotary", defaultGpm: getDefaultGpmPerHead("rotary"), precipInHr: 0.43 },
  { value: "rotor", label: "Rotor", defaultGpm: getDefaultGpmPerHead("rotor"), precipInHr: 0.4 },
  { value: "drip", label: "Drip Emitter", defaultGpm: getDefaultGpmPerHead("drip"), precipInHr: 0.43 },
  { value: "bubbler", label: "Bubbler", defaultGpm: getDefaultGpmPerHead("bubbler"), precipInHr: 0.2 },
];

export const WIZARD_STEPS = [
  { step: 1, title: "Property", description: "Locate the property and capture a satellite image" },
  { step: 2, title: "System overview", description: "How many zones, and where is the shutoff valve and controller?" },
  { step: 3, title: "Zone map", description: "Draw a polygon on the aerial image for each zone" },
  { step: 4, title: "Zone conditions", description: "Vegetation, shade, slope, and soil for each zone" },
  { step: 5, title: "Irrigation", description: "Nozzle types and counts per zone" },
  { step: 6, title: "Review", description: "Publish and share with your customer" },
] as const;

export const ZONE_MAP_COLORS = [
  "#22c55e",
  "#3b82f6",
  "#f59e0b",
  "#ec4899",
  "#8b5cf6",
  "#14b8a6",
  "#ef4444",
  "#6366f1",
] as const;

export type IrrigationMapMarkerKind = "POC" | "TIMER" | "VALVE" | "FILTER" | "BACKFLOW";

export const MAP_MARKER_STYLES: Record<
  IrrigationMapMarkerKind,
  { label: string; color: string; short: string }
> = {
  POC: { label: "POC", color: "#2563EB", short: "P" },
  TIMER: { label: "Timer", color: "#7C3AED", short: "T" },
  VALVE: { label: "Valve", color: "#DC2626", short: "V" },
  FILTER: { label: "Filter", color: "#059669", short: "F" },
  BACKFLOW: { label: "Backflow", color: "#D97706", short: "B" },
};

export const WATER_SOURCE_OPTIONS = [
  { value: "SECONDARY", label: "Secondary water" },
  { value: "CULINARY", label: "Culinary water" },
  { value: "BOTH", label: "Both secondary and culinary" },
] as const;

export const IRRIGATION_MAP_MARKER_KINDS: IrrigationMapMarkerKind[] = [
  "POC",
  "TIMER",
  "VALVE",
  "FILTER",
  "BACKFLOW",
];

export const VALVE_CAPACITY_GPM = 18;

export const VEGETATION_COLORS: Record<VegetationType, string> = {
  grass: "#22c55e",
  shrubs: "#84cc16",
  trees: "#15803d",
  flower_bed: "#ec4899",
};

export const DEFAULT_MAP_CENTER: [number, number] = [-111.891, 40.3916];

export const DEFAULT_ZONE_ATTRIBUTES = {
  vegetation_type: "grass" as VegetationType,
  shade_level: "full_sun" as ShadeLevel,
  slope_level: "flat" as SlopeLevel,
  soil_type: "loam" as SoilType,
  irrigation_type: "spray" as IrrigationType,
};
