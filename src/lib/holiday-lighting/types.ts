export type HolidayLatLng = { lat: number; lng: number };

export type HolidaySegmentKind = "roofline" | "peak" | "garland" | "custom";

export type HolidayMeasurementSegment = {
  id: string;
  label: string;
  kind: HolidaySegmentKind;
  path: HolidayLatLng[];
  lengthFt: number;
  /** Catalog light style key (e.g. c9-warm-white). */
  lightStyleKey?: string;
};

export type HolidayPlacementKind = "tree" | "bush";
export type HolidayTreeSize = "small" | "medium" | "large";

export type HolidayMeasurementPlacement = {
  id: string;
  kind: HolidayPlacementKind;
  size: HolidayTreeSize;
  label: string;
  latLng: HolidayLatLng;
};

export type HolidayMeasurements = {
  segments: HolidayMeasurementSegment[];
  placements: HolidayMeasurementPlacement[];
};

export type HolidayQuoteSelections = {
  /** Default light style for new segments. */
  defaultLightStyleKey: string;
  marginPct: number;
  includeLease: boolean;
  notes?: string;
};

export type HolidayLightStyle = {
  key: string;
  label: string;
  /** Price book SKU for parts $/ft */
  partsSku: string;
  /** Price book SKU for install $/ft */
  installSku: string;
  /** Optional lease $/ft SKU (season) */
  leaseSku?: string;
};

export type HolidayPlacementCatalogItem = {
  key: string;
  kind: HolidayPlacementKind;
  size: HolidayTreeSize;
  label: string;
  sku: string;
  leaseSku?: string;
};

export type HolidayLightingCatalog = {
  lightStyles: HolidayLightStyle[];
  placements: HolidayPlacementCatalogItem[];
  peakSku?: string;
  peakLeaseSku?: string;
};

export const DEFAULT_HOLIDAY_CATALOG: HolidayLightingCatalog = {
  lightStyles: [
    {
      key: "c9-warm-white",
      label: "C9 Warm White",
      partsSku: "CC-ROOF-PARTS-FT",
      installSku: "CC-ROOF-INSTALL-FT",
      leaseSku: "CC-ROOF-LEASE-FT",
    },
    {
      key: "c9-multicolor",
      label: "C9 Multicolor",
      partsSku: "CC-ROOF-MC-PARTS-FT",
      installSku: "CC-ROOF-MC-INSTALL-FT",
      leaseSku: "CC-ROOF-MC-LEASE-FT",
    },
    {
      key: "c9-cool-white",
      label: "C9 Cool White",
      partsSku: "CC-ROOF-CW-PARTS-FT",
      installSku: "CC-ROOF-CW-INSTALL-FT",
      leaseSku: "CC-ROOF-CW-LEASE-FT",
    },
  ],
  placements: [
    {
      key: "tree-small",
      kind: "tree",
      size: "small",
      label: "Tree wrap — small",
      sku: "CC-TREE-S",
      leaseSku: "CC-TREE-S-LEASE",
    },
    {
      key: "tree-medium",
      kind: "tree",
      size: "medium",
      label: "Tree wrap — medium",
      sku: "CC-TREE-M",
      leaseSku: "CC-TREE-M-LEASE",
    },
    {
      key: "tree-large",
      kind: "tree",
      size: "large",
      label: "Tree wrap — large",
      sku: "CC-TREE-L",
      leaseSku: "CC-TREE-L-LEASE",
    },
    {
      key: "bush",
      kind: "bush",
      size: "small",
      label: "Bush / shrub wrap",
      sku: "CC-BUSH",
      leaseSku: "CC-BUSH-LEASE",
    },
  ],
  peakSku: "CC-PEAK",
  peakLeaseSku: "CC-PEAK-LEASE",
};

export const DEFAULT_HOLIDAY_SELECTIONS: HolidayQuoteSelections = {
  defaultLightStyleKey: "c9-warm-white",
  marginPct: 10,
  includeLease: true,
};

export const EMPTY_HOLIDAY_MEASUREMENTS: HolidayMeasurements = {
  segments: [],
  placements: [],
};

export function parseHolidayCatalog(raw: unknown): HolidayLightingCatalog {
  if (!raw || typeof raw !== "object") return DEFAULT_HOLIDAY_CATALOG;
  const obj = raw as Partial<HolidayLightingCatalog>;
  return {
    lightStyles:
      Array.isArray(obj.lightStyles) && obj.lightStyles.length > 0
        ? obj.lightStyles
        : DEFAULT_HOLIDAY_CATALOG.lightStyles,
    placements:
      Array.isArray(obj.placements) && obj.placements.length > 0
        ? obj.placements
        : DEFAULT_HOLIDAY_CATALOG.placements,
    peakSku: obj.peakSku ?? DEFAULT_HOLIDAY_CATALOG.peakSku,
    peakLeaseSku: obj.peakLeaseSku ?? DEFAULT_HOLIDAY_CATALOG.peakLeaseSku,
  };
}

export function parseHolidayMeasurements(raw: unknown): HolidayMeasurements {
  if (!raw || typeof raw !== "object") return EMPTY_HOLIDAY_MEASUREMENTS;
  const obj = raw as Partial<HolidayMeasurements>;
  return {
    segments: Array.isArray(obj.segments) ? obj.segments : [],
    placements: Array.isArray(obj.placements) ? obj.placements : [],
  };
}

export function parseHolidaySelections(raw: unknown): HolidayQuoteSelections {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_HOLIDAY_SELECTIONS };
  const obj = raw as Partial<HolidayQuoteSelections>;
  return {
    defaultLightStyleKey:
      obj.defaultLightStyleKey ?? DEFAULT_HOLIDAY_SELECTIONS.defaultLightStyleKey,
    marginPct:
      typeof obj.marginPct === "number" && Number.isFinite(obj.marginPct)
        ? Math.min(50, Math.max(0, obj.marginPct))
        : DEFAULT_HOLIDAY_SELECTIONS.marginPct,
    includeLease: obj.includeLease !== false,
    notes: typeof obj.notes === "string" ? obj.notes : undefined,
  };
}
