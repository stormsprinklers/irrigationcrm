export type HolidayLatLng = { lat: number; lng: number };

export type HolidaySegmentKind = "roofline" | "peak" | "garland" | "custom";

export const PEAK_LENGTH_MULTIPLIER = 1.5;

export type HolidayInstallKind = "temporary" | "permanent";

export type HolidayMeasurementSegment = {
  id: string;
  label: string;
  kind: HolidaySegmentKind;
  path: HolidayLatLng[];
  /** Satellite plan length (horizontal run). */
  lengthFt: number;
  lightStyleKey?: string;
  horizontalLengthFt?: number;
  /** When true, billed length is plan length × 1.5 (simple peak). */
  hasPeak?: boolean;
  /** Legacy street-view pitch fields — ignored for billing. */
  pitchDeg?: number;
  riseFt?: number;
  pitchDegRight?: number;
  lengthFtRight?: number;
  flat?: boolean;
};

export type StreetViewNormPoint = { x: number; y: number };

/** @deprecated Street-view pitch matching is archived. Kept for old quotes. */
export type StreetViewRoofTrace = {
  id: string;
  satelliteSegmentId: string;
  points: StreetViewNormPoint[];
};

export type HolidayMeasurements = {
  segments: HolidayMeasurementSegment[];
  placements: HolidayMeasurementPlacement[];
  streetTraces?: StreetViewRoofTrace[];
  strands?: HolidayStrand[];
};

export type HolidayStrand = {
  id: string;
  label: string;
  segmentIds: string[];
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
  defaultLightStyleKey: string;
  installKind: HolidayInstallKind;
  notes?: string;
  /** @deprecated Company minimums replace per-quote margin. */
  marginPct?: number;
  includeLease?: boolean;
};

export type HolidayLightStyle = {
  key: string;
  label: string;
  temporaryYear1Sku: string;
  temporaryReinstallSku: string;
  leaseSku: string;
  permanentSku: string;
  partsSku?: string;
  installSku?: string;
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
  defaultLightStyleKey: string;
  defaultInstallKind: HolidayInstallKind;
  temporaryYear1Minimum: number;
  permanentYear1Minimum: number;
  marginPct?: number;
  includeLease?: boolean;
};

export type HolidayLightingCatalog = {
  lightStyles: HolidayLightStyle[];
  placements: HolidayPlacementCatalogItem[];
  peakSku?: string;
  peakLeaseSku?: string;
  quoteDefaults?: HolidayQuoteDefaults;
};

export type HolidayCatalogSku = {
  sku: string;
  name: string;
  unit: "ft" | "each";
};

export type HolidayPriceBookRow = HolidayCatalogSku & {
  unitPrice: number;
  unitCost: number | null;
  priceBookItemId: string | null;
};

export const DEFAULT_HOLIDAY_CATALOG: HolidayLightingCatalog = {
  lightStyles: [
    {
      key: "c9-warm-white",
      label: "C9 Warm White",
      temporaryYear1Sku: "HL-WW-YR1-FT",
      temporaryReinstallSku: "HL-WW-REINSTALL-FT",
      leaseSku: "HL-WW-LEASE-FT",
      permanentSku: "HL-WW-PERM-FT",
    },
    {
      key: "c9-multicolor",
      label: "C9 Multicolor",
      temporaryYear1Sku: "HL-MC-YR1-FT",
      temporaryReinstallSku: "HL-MC-REINSTALL-FT",
      leaseSku: "HL-MC-LEASE-FT",
      permanentSku: "HL-MC-PERM-FT",
    },
    {
      key: "c9-cool-white",
      label: "C9 Cool White",
      temporaryYear1Sku: "HL-CW-YR1-FT",
      temporaryReinstallSku: "HL-CW-REINSTALL-FT",
      leaseSku: "HL-CW-LEASE-FT",
      permanentSku: "HL-CW-PERM-FT",
    },
  ],
  placements: [
    {
      key: "tree-small",
      kind: "tree",
      size: "small",
      label: "Tree wrap — small",
      sku: "HL-TREE-S",
    },
    {
      key: "tree-medium",
      kind: "tree",
      size: "medium",
      label: "Tree wrap — medium",
      sku: "HL-TREE-M",
    },
    {
      key: "tree-large",
      kind: "tree",
      size: "large",
      label: "Tree wrap — large",
      sku: "HL-TREE-L",
    },
    {
      key: "bush-small",
      kind: "bush",
      size: "small",
      label: "Bush wrap — small",
      sku: "HL-BUSH-S",
    },
    {
      key: "bush-medium",
      kind: "bush",
      size: "medium",
      label: "Bush wrap — medium",
      sku: "HL-BUSH-M",
    },
    {
      key: "bush-large",
      kind: "bush",
      size: "large",
      label: "Bush wrap — large",
      sku: "HL-BUSH-L",
    },
  ],
  quoteDefaults: {
    defaultLightStyleKey: "c9-warm-white",
    defaultInstallKind: "temporary",
    temporaryYear1Minimum: 0,
    permanentYear1Minimum: 0,
  },
};

export const DEFAULT_HOLIDAY_SELECTIONS: HolidayQuoteSelections = {
  defaultLightStyleKey: "c9-warm-white",
  installKind: "temporary",
};

export const EMPTY_HOLIDAY_MEASUREMENTS: HolidayMeasurements = {
  segments: [],
  placements: [],
  streetTraces: [],
  strands: [],
};

export const HOLIDAY_PREVIEW_DISCLAIMER =
  "This preview is AI generated and is not a guarantee of exact light placement.";

function parseInstallKind(raw: unknown): HolidayInstallKind {
  return String(raw ?? "").toLowerCase() === "permanent" ? "permanent" : "temporary";
}

function parseMoney(raw: unknown, fallback = 0) {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.round(n * 100) / 100;
}

function parseQuoteDefaults(raw: unknown): HolidayQuoteDefaults {
  const fallback = DEFAULT_HOLIDAY_CATALOG.quoteDefaults!;
  if (!raw || typeof raw !== "object") return { ...fallback };
  const obj = raw as Partial<HolidayQuoteDefaults> & { includeLease?: boolean };
  return {
    defaultLightStyleKey:
      typeof obj.defaultLightStyleKey === "string" && obj.defaultLightStyleKey
        ? obj.defaultLightStyleKey
        : fallback.defaultLightStyleKey,
    defaultInstallKind: parseInstallKind(obj.defaultInstallKind),
    temporaryYear1Minimum: parseMoney(obj.temporaryYear1Minimum, fallback.temporaryYear1Minimum),
    permanentYear1Minimum: parseMoney(obj.permanentYear1Minimum, fallback.permanentYear1Minimum),
  };
}

function parseLightStyle(raw: unknown, fallback: HolidayLightStyle): HolidayLightStyle {
  if (!raw || typeof raw !== "object") return fallback;
  const obj = raw as Partial<HolidayLightStyle>;
  const key = typeof obj.key === "string" && obj.key ? obj.key : fallback.key;
  return {
    key,
    label: typeof obj.label === "string" && obj.label ? obj.label : fallback.label,
    temporaryYear1Sku:
      obj.temporaryYear1Sku || obj.partsSku || fallback.temporaryYear1Sku,
    temporaryReinstallSku:
      obj.temporaryReinstallSku || obj.installSku || fallback.temporaryReinstallSku,
    leaseSku: obj.leaseSku || fallback.leaseSku,
    permanentSku: obj.permanentSku || fallback.permanentSku,
  };
}

function parsePlacement(
  raw: unknown,
  fallback: HolidayPlacementCatalogItem
): HolidayPlacementCatalogItem {
  if (!raw || typeof raw !== "object") return fallback;
  const obj = raw as Partial<HolidayPlacementCatalogItem>;
  const size: HolidayTreeSize =
    obj.size === "small" || obj.size === "medium" || obj.size === "large" || obj.size === "xl"
      ? obj.size === "xl"
        ? "large"
        : obj.size
      : fallback.size;
  const kind: HolidayPlacementKind = obj.kind === "bush" ? "bush" : "tree";
  return {
    key: typeof obj.key === "string" && obj.key ? obj.key : fallback.key,
    kind,
    size,
    label: typeof obj.label === "string" && obj.label ? obj.label : fallback.label,
    sku: typeof obj.sku === "string" && obj.sku ? obj.sku : fallback.sku,
    leaseSku: typeof obj.leaseSku === "string" && obj.leaseSku ? obj.leaseSku : fallback.leaseSku,
  };
}

export function parseHolidayCatalog(raw: unknown): HolidayLightingCatalog {
  if (!raw || typeof raw !== "object") return DEFAULT_HOLIDAY_CATALOG;
  const obj = raw as Partial<HolidayLightingCatalog>;
  const styles =
    Array.isArray(obj.lightStyles) && obj.lightStyles.length > 0
      ? obj.lightStyles.map((style, i) =>
          parseLightStyle(style, DEFAULT_HOLIDAY_CATALOG.lightStyles[i] ?? DEFAULT_HOLIDAY_CATALOG.lightStyles[0]!)
        )
      : DEFAULT_HOLIDAY_CATALOG.lightStyles;
  const placements =
    Array.isArray(obj.placements) && obj.placements.length > 0
      ? mergePlacements(obj.placements)
      : DEFAULT_HOLIDAY_CATALOG.placements;
  return {
    lightStyles: styles,
    placements,
    quoteDefaults: parseQuoteDefaults(obj.quoteDefaults),
  };
}

function mergePlacements(raw: unknown[]): HolidayPlacementCatalogItem[] {
  const parsed = raw.map((row, i) =>
    parsePlacement(row, DEFAULT_HOLIDAY_CATALOG.placements[i] ?? DEFAULT_HOLIDAY_CATALOG.placements[0]!)
  );
  const byKey = new Map(parsed.map((p) => [p.key, p]));
  for (const fallback of DEFAULT_HOLIDAY_CATALOG.placements) {
    if (!byKey.has(fallback.key)) byKey.set(fallback.key, fallback);
  }
  return [...byKey.values()];
}

export function holidayCatalogSkus(catalog: HolidayLightingCatalog): HolidayCatalogSku[] {
  const rows: HolidayCatalogSku[] = [];
  const seen = new Set<string>();
  function add(sku: string | undefined, name: string, unit: "ft" | "each") {
    const code = sku?.trim();
    if (!code || seen.has(code)) return;
    seen.add(code);
    rows.push({ sku: code, name, unit });
  }
  for (const style of catalog.lightStyles) {
    add(style.temporaryYear1Sku, `${style.label} — buy, first year / ft`, "ft");
    add(style.temporaryReinstallSku, `${style.label} — buy, future years / ft`, "ft");
    add(style.leaseSku, `${style.label} — lease, seasonal / ft`, "ft");
    add(style.permanentSku, `${style.label} — permanent / ft`, "ft");
  }
  for (const placement of catalog.placements) {
    add(placement.sku, placement.label, "each");
    add(placement.leaseSku, `${placement.label} — lease`, "each");
  }
  return rows;
}

export function holidaySelectionsFromCatalog(
  catalog: HolidayLightingCatalog
): HolidayQuoteSelections {
  const d = catalog.quoteDefaults ?? DEFAULT_HOLIDAY_CATALOG.quoteDefaults!;
  return {
    defaultLightStyleKey: d.defaultLightStyleKey,
    installKind: d.defaultInstallKind,
  };
}

export function applyHolidayCatalogPolicy(
  selections: HolidayQuoteSelections,
  catalog: HolidayLightingCatalog
): HolidayQuoteSelections {
  const d = catalog.quoteDefaults ?? DEFAULT_HOLIDAY_CATALOG.quoteDefaults!;
  const style =
    catalog.lightStyles.find((s) => s.key === selections.defaultLightStyleKey) ??
    catalog.lightStyles.find((s) => s.key === d.defaultLightStyleKey) ??
    catalog.lightStyles[0];
  return {
    defaultLightStyleKey: style?.key ?? d.defaultLightStyleKey,
    installKind: selections.installKind === "permanent" ? "permanent" : "temporary",
    notes: selections.notes,
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
  const segments = Array.isArray(obj.segments)
    ? obj.segments.map((seg) => ({
        ...seg,
        hasPeak: Boolean((seg as HolidayMeasurementSegment).hasPeak),
      }))
    : [];
  return {
    segments,
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
    installKind: parseInstallKind(obj.installKind),
    notes: typeof obj.notes === "string" ? obj.notes : undefined,
  };
}

export function findPlacementCatalogItem(
  catalog: HolidayLightingCatalog,
  placement: Pick<HolidayMeasurementPlacement, "kind" | "size">
) {
  const size = placement.size === "xl" ? "large" : placement.size;
  return (
    catalog.placements.find((p) => p.kind === placement.kind && p.size === size) ??
    catalog.placements.find((p) => p.kind === placement.kind) ??
    null
  );
}
