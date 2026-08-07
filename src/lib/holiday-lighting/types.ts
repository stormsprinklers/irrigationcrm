export type HolidayLatLng = { lat: number; lng: number };

export type HolidaySegmentKind = "roofline" | "peak" | "garland" | "custom";

export type HolidayMeasurementSegment = {
  id: string;
  label: string;
  kind: HolidaySegmentKind;
  path: HolidayLatLng[];
  /** Billable / true roof length (after pitch correction when available). */
  lengthFt: number;
  /** Catalog light style key (e.g. c9-warm-white). */
  lightStyleKey?: string;
  /** Satellite plan length (horizontal run) before pitch correction. */
  horizontalLengthFt?: number;
  /** Pitch from street-view match (degrees from horizontal). */
  pitchDeg?: number;
  /** Estimated vertical rise over the horizontal run. */
  riseFt?: number;
  /** Gable: right-side pitch / length (lengthFt is left or total — see pitchedLengthFt). */
  pitchDegRight?: number;
  lengthFtRight?: number;
  /** True when this span is flat (no pitch match needed; billed length = plan length). */
  flat?: boolean;
};

export type StreetViewNormPoint = { x: number; y: number };

/** Line(s) drawn on the captured street-view photo, linked to a satellite segment. */
export type StreetViewRoofTrace = {
  id: string;
  satelliteSegmentId: string;
  /**
   * 2 points = single slope (both ends of the roof edge).
   * 3 points = gable (left eave, right eave, peak). Diagonals left→peak and right→peak are derived.
   */
  points: StreetViewNormPoint[];
};

export type HolidayMeasurements = {
  segments: HolidayMeasurementSegment[];
  placements: HolidayMeasurementPlacement[];
  streetTraces?: StreetViewRoofTrace[];
  /** Named groups of pitch-resolved segments — one quote line + installer label. */
  strands?: HolidayStrand[];
};

/** Install + quote grouping of finalized roofline segments. */
export type HolidayStrand = {
  id: string;
  label: string;
  segmentIds: string[];
  /** Optional light style override; else first member / quote default. */
  lightStyleKey?: string;
};

export type HolidayPlacementKind = "tree" | "bush";
export type HolidayTreeSize = "small" | "medium" | "large" | "xl";

export type HolidayMeasurementPlacement = {
  id: string;
  kind: HolidayPlacementKind;
  size: HolidayTreeSize;
  label: string;
  latLng: HolidayLatLng;
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

export type HolidayQuoteDefaults = {
  marginPct: number;
  includeLease: boolean;
  defaultLightStyleKey: string;
};

export type HolidayLightingCatalog = {
  lightStyles: HolidayLightStyle[];
  placements: HolidayPlacementCatalogItem[];
  peakSku?: string;
  peakLeaseSku?: string;
  /** Company-wide defaults applied to new quotes. */
  quoteDefaults?: HolidayQuoteDefaults;
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
      label: "Tree/shrub wrap — small",
      sku: "CC-TREE-S",
      leaseSku: "CC-TREE-S-LEASE",
    },
    {
      key: "tree-medium",
      kind: "tree",
      size: "medium",
      label: "Tree/shrub wrap — medium",
      sku: "CC-TREE-M",
      leaseSku: "CC-TREE-M-LEASE",
    },
    {
      key: "tree-large",
      kind: "tree",
      size: "large",
      label: "Tree/shrub wrap — large",
      sku: "CC-TREE-L",
      leaseSku: "CC-TREE-L-LEASE",
    },
    {
      key: "tree-xl",
      kind: "tree",
      size: "xl",
      label: "Tree/shrub wrap — extra large",
      sku: "CC-TREE-XL",
      leaseSku: "CC-TREE-XL-LEASE",
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
  quoteDefaults: {
    defaultLightStyleKey: "c9-warm-white",
    marginPct: 10,
    includeLease: true,
  },
};

export const DEFAULT_HOLIDAY_SELECTIONS: HolidayQuoteSelections = {
  defaultLightStyleKey: "c9-warm-white",
  marginPct: 10,
  includeLease: true,
};

export const EMPTY_HOLIDAY_MEASUREMENTS: HolidayMeasurements = {
  segments: [],
  placements: [],
  streetTraces: [],
  strands: [],
};

function parseQuoteDefaults(raw: unknown): HolidayQuoteDefaults {
  const fallback = DEFAULT_HOLIDAY_CATALOG.quoteDefaults!;
  if (!raw || typeof raw !== "object") return { ...fallback };
  const obj = raw as Partial<HolidayQuoteDefaults>;
  const margin =
    typeof obj.marginPct === "number" && Number.isFinite(obj.marginPct)
      ? Math.min(50, Math.max(0, obj.marginPct))
      : fallback.marginPct;
  return {
    marginPct: margin,
    includeLease: obj.includeLease !== false,
    defaultLightStyleKey:
      typeof obj.defaultLightStyleKey === "string" && obj.defaultLightStyleKey
        ? obj.defaultLightStyleKey
        : fallback.defaultLightStyleKey,
  };
}

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
    quoteDefaults: parseQuoteDefaults(obj.quoteDefaults),
  };
}

/** Selections for a brand-new quote, using company catalog defaults. */
export function holidaySelectionsFromCatalog(
  catalog: HolidayLightingCatalog
): HolidayQuoteSelections {
  const d = catalog.quoteDefaults ?? DEFAULT_HOLIDAY_CATALOG.quoteDefaults!;
  return {
    defaultLightStyleKey: d.defaultLightStyleKey,
    marginPct: d.marginPct,
    includeLease: d.includeLease,
  };
}

/**
 * Lock company policy fields (error margin + lease) from settings onto a quote.
 * Light style and notes stay per-quote.
 */
export function applyHolidayCatalogPolicy(
  selections: HolidayQuoteSelections,
  catalog: HolidayLightingCatalog
): HolidayQuoteSelections {
  const d = catalog.quoteDefaults ?? DEFAULT_HOLIDAY_CATALOG.quoteDefaults!;
  return {
    ...selections,
    marginPct: d.marginPct,
    includeLease: d.includeLease,
  };
}

export function parseHolidayMeasurements(raw: unknown): HolidayMeasurements {
  if (!raw || typeof raw !== "object") return EMPTY_HOLIDAY_MEASUREMENTS;
  const obj = raw as Partial<HolidayMeasurements>;
  const strands = Array.isArray(obj.strands)
    ? obj.strands.filter(
        (s): s is HolidayStrand =>
          !!s &&
          typeof s === "object" &&
          typeof (s as HolidayStrand).id === "string" &&
          typeof (s as HolidayStrand).label === "string" &&
          Array.isArray((s as HolidayStrand).segmentIds)
      )
    : [];
  return {
    segments: Array.isArray(obj.segments) ? obj.segments : [],
    placements: Array.isArray(obj.placements) ? obj.placements : [],
    streetTraces: Array.isArray(obj.streetTraces) ? obj.streetTraces : [],
    strands,
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
