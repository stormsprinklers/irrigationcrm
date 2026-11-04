import { MAX_ESTIMATE_OPTIONS } from "@/lib/estimates/limits";

export type HolidayLatLng = { lat: number; lng: number };

export type HolidaySegmentKind = "roofline" | "peak" | "garland" | "custom";

export const PEAK_LENGTH_MULTIPLIER = 1.5;

export type HolidayInstallKind = "temporary" | "permanent";
export type HolidayQuoteBillingMode = "standard" | "labor_only";
export type HolidayQuotePricingMode = "buy" | "lease" | "labor" | "permanent";
export type HolidayLeaseContractYears = 1 | 3 | 5;
export type HolidayDifficulty = 1 | 2 | 3;

export const HOLIDAY_COLOR_PATTERNS = [
  "Warm White",
  "Winter White",
  "Champagne",
  "Red",
  "Green",
  "Blue",
  "Yellow",
  "Pink",
  "Orange",
  "Multicolor",
  "Other",
] as const;

export const HOLIDAY_STRAND_COLORS = ["Black", "White", "Green"] as const;
export type HolidayStrandColor = (typeof HOLIDAY_STRAND_COLORS)[number];

export type HolidayMeasurementSegment = {
  id: string;
  label: string;
  kind: HolidaySegmentKind;
  path: HolidayLatLng[];
  /** Satellite plan length (horizontal run). */
  lengthFt: number;
  lightStyleKey?: string;
  colorPattern?: string;
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
  /** Legacy display size retained so existing saved quotes continue to load. */
  size: HolidayTreeSize;
  strandCount?: number;
  liftRentalNeeded?: boolean;
  label: string;
  latLng: HolidayLatLng;
  difficulty?: HolidayDifficulty;
  lightStyleKey?: string;
  colorPattern?: string;
};

export type HolidayQuoteSelections = {
  defaultLightStyleKey: string;
  installKind: HolidayInstallKind;
  billingMode?: HolidayQuoteBillingMode;
  pricingMode?: HolidayQuotePricingMode;
  includeLaborOnlyOption?: boolean;
  includePermanentOption?: boolean;
  defaultColorPattern?: string;
  /** Internal-only wire color; never included in customer-facing quote copy. */
  strandColor?: HolidayStrandColor;
  notes?: string;
  completedSteps?: string[];
  /** @deprecated Company minimums replace per-quote margin. */
  marginPct?: number;
  includeLease?: boolean;
  optionAdjustments?: Partial<Record<HolidayQuoteOptionKey, HolidayOptionAdjustment>>;
  reinstallPrice?: number | null;
  customServices?: HolidayCustomService[];
  leaseContractYears?: HolidayLeaseContractYears;
  designOptions?: HolidayQuoteDesignOption[];
  activeDesignOptionId?: string;
};

export type HolidayPhotoStroke = {
  id: string;
  points: Array<{ x: number; y: number }>;
  color: string;
  width: number;
};

export function parseHolidayPhotoMarkup(raw: unknown): HolidayPhotoStroke[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 150).flatMap((stroke) => {
    if (!stroke || typeof stroke !== "object") return [];
    const points = Array.isArray(stroke.points) ? stroke.points.slice(0, 1500).filter(
      (point: { x?: unknown; y?: unknown }) => typeof point?.x === "number" && Number.isFinite(point.x)
        && point.x >= 0 && point.x <= 1 && typeof point.y === "number" && Number.isFinite(point.y) && point.y >= 0 && point.y <= 1
    ) : [];
    if (!points.length) return [];
    return [{ id: typeof stroke.id === "string" ? stroke.id.slice(0, 80) : crypto.randomUUID(), points,
      color: typeof stroke.color === "string" && /^#[0-9a-f]{6}$/i.test(stroke.color) ? stroke.color : "#ffb020",
      width: typeof stroke.width === "number" && Number.isFinite(stroke.width) ? Math.min(0.08, Math.max(0.003, stroke.width)) : 0.012 }];
  });
}

export type HolidayQuoteDesignOption = {
  photoMarkup?: HolidayPhotoStroke[];
  id: string;
  label: string;
  /** Option-specific customer preview. The source property photo remains quote-wide. */
  previewImageUrl?: string;
  previewPrompt?: string;
  measurements: HolidayMeasurements;
  selections: {
    defaultLightStyleKey: string;
    installKind: HolidayInstallKind;
    billingMode: HolidayQuoteBillingMode;
    pricingMode: HolidayQuotePricingMode;
    defaultColorPattern?: string;
    strandColor?: HolidayStrandColor;
    notes?: string;
    completedSteps?: string[];
    optionAdjustments?: Partial<Record<HolidayQuoteOptionKey, HolidayOptionAdjustment>>;
    reinstallPrice?: number | null;
    customServices?: HolidayCustomService[];
    leaseContractYears?: HolidayLeaseContractYears;
  };
};

export type HolidayCustomService = {
  id: string;
  /** Present for preset items backed by the Holiday lighting price book. */
  sku?: string;
  name: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  /** One-off item material cost. Presets resolve cost from their price-book SKU. */
  unitCost?: number;
};

export type HolidayQuoteOptionKey = "buy" | "lease" | "permanent" | "labor";
export type HolidayQuoteLineItem = {
  id: string; name: string; description: string; quantity: number; unitPrice: number;
  kind: "parts" | "labor" | "service" | "included";
};

export type HolidayOptionAdjustment = {
  lineItems?: HolidayQuoteLineItem[];
  price?: number | null;
  partsPrice?: number | null;
  laborPrice?: number | null;
  discountLabel?: string;
  discountType?: "fixed" | "percent";
  discountAmount?: number;
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
  kind?: HolidayInstallKind;
};

export type HolidayPlacementCatalogItem = {
  key: string;
  kind: HolidayPlacementKind;
  size: HolidayTreeSize;
  label: string;
  sku: string;
  leaseSku?: string;
  difficulty?: HolidayDifficulty;
  partsSku?: string;
  installSku?: string;
};

export type HolidayAdditionalCatalogItem = {
  key: string;
  label: string;
  description: string;
  sku: string;
  defaultUnitPrice: number;
  defaultUnitCost: number;
};

export type HolidayDifficultyMultipliers = Record<HolidayDifficulty, number>;

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
  additionalItems: HolidayAdditionalCatalogItem[];
  peakSku?: string;
  peakLeaseSku?: string;
  liftRentalSku?: string;
  difficultyMultipliers?: HolidayDifficultyMultipliers;
  quoteDefaults?: HolidayQuoteDefaults;
};

export type HolidayCatalogSku = {
  sku: string;
  name: string;
  description?: string;
  unit: "ft" | "each";
  defaultUnitPrice?: number;
  defaultUnitCost?: number;
};

export type HolidayPriceBookRow = HolidayCatalogSku & {
  unitPrice: number;
  unitCost: number | null;
  priceBookItemId: string | null;
};

const PRELIT_MOUNTING_NOTE =
  "Artificial and pre-lit. Installation may require mounting brackets or fasteners to the home in order to hang it.";

export const DEFAULT_HOLIDAY_ADDITIONAL_ITEMS: HolidayAdditionalCatalogItem[] = [
  ["wreath-24", '24" wreath', "HL-WREATH-24-EACH", 41.92],
  ["wreath-30", '30" wreath', "HL-WREATH-30-EACH", 71],
  ["wreath-36", '36" wreath', "HL-WREATH-36-EACH", 90.7],
  ["wreath-48", '48" wreath', "HL-WREATH-48-EACH", 201.39],
  ["wreath-60", '60" wreath', "HL-WREATH-60-EACH", 314.58],
  ["wreath-72", '72" wreath', "HL-WREATH-72-EACH", 423.36],
  ["garland-9", "9 ft garland", "HL-GARLAND-9FT-EACH", 83.06],
].map(([key, label, sku, cost]) => ({
  key: String(key),
  label: String(label),
  sku: String(sku),
  description: PRELIT_MOUNTING_NOTE,
  defaultUnitPrice: Math.round(Number(cost) * 0.7 * 100) / 100,
  defaultUnitCost: Number(cost),
}));

export const DEFAULT_HOLIDAY_CATALOG: HolidayLightingCatalog = {
  lightStyles: [
    {
      key: "c9",
      label: "C9",
      temporaryYear1Sku: "HL-C9-SERVICE-FT",
      temporaryReinstallSku: "HL-C9-SERVICE-FT",
      leaseSku: "HL-C9-SERVICE-FT",
      permanentSku: "HL-C9-SERVICE-FT",
      partsSku: "HL-C9-SERVICE-FT",
      installSku: "HL-C9-SERVICE-FT",
      kind: "temporary",
    },
    {
      key: "c7",
      label: "C7",
      temporaryYear1Sku: "HL-C7-SERVICE-FT",
      temporaryReinstallSku: "HL-C7-SERVICE-FT",
      leaseSku: "HL-C7-SERVICE-FT",
      permanentSku: "HL-C7-SERVICE-FT",
      partsSku: "HL-C7-SERVICE-FT",
      installSku: "HL-C7-SERVICE-FT",
      kind: "temporary",
    },
    {
      key: "lightstream",
      label: "LightStream (Color-Changing)",
      temporaryYear1Sku: "HL-LIGHTSTREAM-SERVICE-FT",
      temporaryReinstallSku: "HL-LIGHTSTREAM-SERVICE-FT",
      leaseSku: "HL-LIGHTSTREAM-SERVICE-FT",
      permanentSku: "HL-LIGHTSTREAM-SERVICE-FT",
      partsSku: "HL-LIGHTSTREAM-SERVICE-FT",
      installSku: "HL-LIGHTSTREAM-SERVICE-FT",
      kind: "temporary",
    },
    {
      key: "permanent",
      label: "Permanent",
      temporaryYear1Sku: "HL-PERM-SERVICE-FT",
      temporaryReinstallSku: "HL-PERM-SERVICE-FT",
      leaseSku: "HL-PERM-SERVICE-FT",
      permanentSku: "HL-PERM-SERVICE-FT",
      partsSku: "HL-PERM-SERVICE-FT",
      installSku: "HL-PERM-SERVICE-FT",
      kind: "permanent",
    },
  ],
  placements: (["tree", "bush"] as const).map((kind) => {
    const prefix = kind === "tree" ? "TREE" : "BUSH";
    const serviceSku = `HL-${prefix}-SERVICE-STRAND`;
    return {
      key: `${kind}-strand`,
      kind,
      size: "small" as const,
      difficulty: 1 as const,
      label: `${kind === "tree" ? "Tree" : "Bush"} lighting / strand`,
      sku: serviceSku,
      partsSku: serviceSku,
      installSku: serviceSku,
      leaseSku: serviceSku,
    };
  }),
  additionalItems: DEFAULT_HOLIDAY_ADDITIONAL_ITEMS,
  difficultyMultipliers: { 1: 1, 2: 1.25, 3: 1.5 },
  quoteDefaults: {
    defaultLightStyleKey: "c9",
    defaultInstallKind: "temporary",
    temporaryYear1Minimum: 0,
    permanentYear1Minimum: 0,
  },
};

export const DEFAULT_HOLIDAY_SELECTIONS: HolidayQuoteSelections = {
  defaultLightStyleKey: "c9",
  installKind: "temporary",
  billingMode: "standard",
  pricingMode: "buy",
  includeLaborOnlyOption: false,
  includePermanentOption: false,
  defaultColorPattern: "Warm White",
  strandColor: "Green",
  leaseContractYears: 1,
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
    // Pricing SKUs are policy, not user-editable catalog data. Always migrate
    // persisted purchase/lease/labor catalogs to the single service SKU.
    temporaryYear1Sku: fallback.temporaryYear1Sku,
    temporaryReinstallSku: fallback.temporaryReinstallSku,
    leaseSku: fallback.leaseSku,
    permanentSku: fallback.permanentSku,
    partsSku: fallback.partsSku,
    installSku: fallback.installSku,
    kind: obj.kind === "permanent" ? "permanent" : fallback.kind ?? "temporary",
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
  const rawDifficulty = Number(obj.difficulty ?? fallback.difficulty ?? 1);
  const difficulty: HolidayDifficulty = rawDifficulty === 2 ? 2 : rawDifficulty === 3 ? 3 : 1;
  return {
    key: typeof obj.key === "string" && obj.key ? obj.key : fallback.key,
    kind,
    size,
    label: typeof obj.label === "string" && obj.label ? obj.label : fallback.label,
    sku: fallback.sku,
    leaseSku: fallback.leaseSku,
    difficulty,
    partsSku: fallback.partsSku,
    installSku: fallback.installSku,
  };
}

export function parseHolidayCatalog(raw: unknown): HolidayLightingCatalog {
  if (!raw || typeof raw !== "object") return DEFAULT_HOLIDAY_CATALOG;
  const obj = raw as Partial<HolidayLightingCatalog>;
  const hasCurrentStyles = Array.isArray(obj.lightStyles) && ["c9", "c7", "lightstream", "permanent"].every(
    (key) => obj.lightStyles!.some((style) => style && typeof style === "object" && (style as HolidayLightStyle).key === key)
  );
  const styles =
    hasCurrentStyles
      ? (obj.lightStyles as HolidayLightStyle[]).map((style, i) =>
          parseLightStyle(
            style,
            DEFAULT_HOLIDAY_CATALOG.lightStyles.find((fallback) => fallback.key === style.key)
              ?? DEFAULT_HOLIDAY_CATALOG.lightStyles[i]
              ?? DEFAULT_HOLIDAY_CATALOG.lightStyles[0]!
          )
        )
      : DEFAULT_HOLIDAY_CATALOG.lightStyles;
  const placements = migratePlacementCatalog(obj.placements);
  const rawMultipliers = obj.difficultyMultipliers;
  const difficultyMultipliers: HolidayDifficultyMultipliers = {
    1: parseMultiplier(rawMultipliers?.[1], 1),
    2: parseMultiplier(rawMultipliers?.[2], 1.25),
    3: parseMultiplier(rawMultipliers?.[3], 1.5),
  };
  const parsedDefaults = parseQuoteDefaults(obj.quoteDefaults);
  const quoteDefaults = {
    ...parsedDefaults,
    defaultLightStyleKey: styles.some((style) => style.key === parsedDefaults.defaultLightStyleKey)
      ? parsedDefaults.defaultLightStyleKey
      : DEFAULT_HOLIDAY_CATALOG.quoteDefaults!.defaultLightStyleKey,
  };
  return {
    lightStyles: styles,
    placements,
    additionalItems: DEFAULT_HOLIDAY_ADDITIONAL_ITEMS,
    difficultyMultipliers,
    quoteDefaults,
  };
}

function parseMultiplier(raw: unknown, fallback: number) {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 && value <= 10
    ? Math.round(value * 100) / 100
    : fallback;
}

function migratePlacementCatalog(raw: unknown): HolidayPlacementCatalogItem[] {
  if (!Array.isArray(raw)) return DEFAULT_HOLIDAY_CATALOG.placements;
  return DEFAULT_HOLIDAY_CATALOG.placements.map((fallback) => {
    const exact = raw.find((row) => row && typeof row === "object" && (row as HolidayPlacementCatalogItem).key === fallback.key);
    const legacy = raw.find((row) => {
      if (!row || typeof row !== "object") return false;
      const item = row as HolidayPlacementCatalogItem;
      return item.kind === fallback.kind && item.size === "small" && Number(item.difficulty ?? 1) === 1;
    }) ?? raw.find((row) => row && typeof row === "object" && (row as HolidayPlacementCatalogItem).kind === fallback.kind);
    const parsed = parsePlacement(exact ?? legacy, fallback);
    return { ...parsed, key: fallback.key, kind: fallback.kind, size: "small", difficulty: 1, label: fallback.label };
  });
}

export function holidayCatalogSkus(catalog: HolidayLightingCatalog): HolidayCatalogSku[] {
  const rows: HolidayCatalogSku[] = [];
  const seen = new Set<string>();
  function add(
    sku: string | undefined,
    name: string,
    unit: "ft" | "each",
    defaultUnitPrice?: number,
    defaultUnitCost?: number,
    description?: string
  ) {
    const code = sku?.trim();
    if (!code || seen.has(code)) return;
    seen.add(code);
    rows.push({ sku: code, name, description, unit, defaultUnitPrice, defaultUnitCost });
  }
  for (const style of catalog.lightStyles) {
    const sku = style.kind === "permanent"
      ? style.permanentSku
      : style.partsSku ?? style.temporaryYear1Sku;
    add(
      sku,
      style.kind === "permanent"
        ? `${style.label} holiday lighting installation / ft`
        : `${style.label} holiday lighting service / ft`,
      "ft",
      style.key === "c9"
        ? 4.59
        : style.key === "c7"
          ? 4.29
          : style.key === "lightstream"
            ? 5.99
            : 25,
      style.key === "lightstream" ? 3.99 : undefined
    );
  }
  for (const placement of catalog.placements) {
    add(placement.sku, `${placement.label} — yearly service`, "each");
  }
  for (const item of catalog.additionalItems) {
    add(
      item.sku,
      item.label,
      "each",
      item.defaultUnitPrice,
      item.defaultUnitCost,
      item.description
    );
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
    billingMode: "standard",
    pricingMode: "buy",
    includeLaborOnlyOption: false,
    includePermanentOption: false,
    defaultColorPattern: "Warm White",
    strandColor: "Green",
    leaseContractYears: 1,
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
  const activeKey: HolidayQuoteOptionKey = style?.kind === "permanent" ? "permanent" : "buy";
  const legacyKey: HolidayQuoteOptionKey = style?.kind === "permanent"
    ? "permanent"
    : selections.pricingMode === "lease" || selections.pricingMode === "labor"
      ? selections.pricingMode
      : "buy";
  const legacyAdjustment = selections.optionAdjustments?.[legacyKey];
  const componentPrice = legacyAdjustment?.partsPrice != null || legacyAdjustment?.laborPrice != null
    ? parseMoney((legacyAdjustment.partsPrice ?? 0) + (legacyAdjustment.laborPrice ?? 0))
    : null;
  const linePrice = legacyAdjustment?.lineItems
    ? parseMoney(legacyAdjustment.lineItems.reduce(
        (sum, line) => sum + (line.kind === "included" ? 0 : line.quantity * line.unitPrice),
        0
      ))
    : null;
  const flatPrice = legacyAdjustment?.price ?? componentPrice ?? linePrice;
  const optionAdjustments = legacyAdjustment
    ? {
        [activeKey]: {
          price: flatPrice,
          discountLabel: legacyAdjustment.discountLabel,
          discountType: legacyAdjustment.discountType,
          discountAmount: legacyAdjustment.discountAmount,
        },
      }
    : undefined;
  return {
    defaultLightStyleKey: style?.key ?? d.defaultLightStyleKey,
    installKind: style?.kind === "permanent" ? "permanent" : "temporary",
    billingMode: "standard",
    pricingMode: style?.kind === "permanent" ? "permanent" : "buy",
    includeLaborOnlyOption: false,
    includePermanentOption: false,
    notes: selections.notes,
    completedSteps: selections.completedSteps,
    defaultColorPattern: selections.defaultColorPattern?.trim() || "Warm White",
    strandColor: HOLIDAY_STRAND_COLORS.includes(selections.strandColor as HolidayStrandColor)
      ? selections.strandColor
      : "Green",
    optionAdjustments,
    reinstallPrice: null,
    customServices: selections.customServices,
    leaseContractYears: 1,
    designOptions: selections.designOptions,
    activeDesignOptionId: selections.activeDesignOptionId,
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
        colorPattern: (seg as HolidayMeasurementSegment).colorPattern || "Warm White",
      }))
    : [];
  return {
    segments,
    placements: Array.isArray(obj.placements)
      ? obj.placements.map((placement) => {
          const source = placement as HolidayMeasurementPlacement;
          const legacyStrands = source.size === "small" ? 1 : source.size === "medium" ? 2 : source.size === "large" ? 3 : 4;
          const requestedStrands = Number(source.strandCount ?? legacyStrands);
          return ({
          ...source,
          size: source.size === "small" || source.size === "medium" || source.size === "large" || source.size === "xl"
            ? source.size
            : "small",
          strandCount: Number.isFinite(requestedStrands)
            ? Math.max(1, Math.min(100, Math.round(requestedStrands)))
            : 1,
          liftRentalNeeded: source.kind === "tree" && source.liftRentalNeeded === true,
          difficulty: Number((placement as HolidayMeasurementPlacement).difficulty) === 2
            ? 2 as const
            : Number((placement as HolidayMeasurementPlacement).difficulty) === 3
              ? 3 as const
              : 1 as const,
          // Trees and bushes always use mini LEDs, regardless of legacy C7/C9 data.
          lightStyleKey: "mini",
          colorPattern: (placement as HolidayMeasurementPlacement).colorPattern || "Warm White",
        });
        })
      : [],
    streetTraces: Array.isArray(obj.streetTraces) ? obj.streetTraces : [],
    strands,
  };
}

/** Apply an option-wide color choice to every measured lighting area. */
export function applyHolidayColorPattern(
  measurements: HolidayMeasurements,
  colorPattern: string
): HolidayMeasurements {
  return {
    ...measurements,
    segments: measurements.segments.map((segment) => ({ ...segment, colorPattern })),
    placements: measurements.placements.map((placement) => ({ ...placement, colorPattern })),
  };
}

export function parseHolidaySelections(raw: unknown): HolidayQuoteSelections {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_HOLIDAY_SELECTIONS };
  const obj = raw as Partial<HolidayQuoteSelections>;
  const adjustments: HolidayQuoteSelections["optionAdjustments"] = {};
  for (const key of ["buy", "lease", "permanent", "labor"] as const) {
    const item = obj.optionAdjustments?.[key];
    if (!item || typeof item !== "object") continue;
    const rawPrice: unknown = item.price;
    const price = rawPrice == null || rawPrice === "" ? null : Number(rawPrice);
    const discountAmount = Number(item.discountAmount ?? 0);
    adjustments[key] = {
      ...(Array.isArray(item.lineItems) ? { lineItems: item.lineItems.slice(0, 100).flatMap((line, index) => {
        if (!line || typeof line !== "object") return [];
        const quantity = Number(line.quantity), price = Number(line.unitPrice);
        if (!Number.isFinite(quantity) || quantity < 0 || quantity > 10000 || !Number.isFinite(price) || price < 0 || price > 9_999_999) return [];
        const kind = ["parts", "labor", "service", "included"].includes(line.kind) ? line.kind : "service" as const;
        return [{ id: typeof line.id === "string" ? line.id.slice(0, 80) : `line-${index}`, name: String(line.name ?? "").trim().slice(0, 200), description: String(line.description ?? "").slice(0, 4000), quantity, unitPrice: kind === "included" ? 0 : Math.round(price * 100) / 100, kind }];
      }) } : {}),
      ...Object.fromEntries((["partsPrice", "laborPrice"] as const).map((field) => {
        const value = item[field];
        return [field, typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 9_999_999 ? Math.round(value * 100) / 100 : null];
      })),
      price: price != null && Number.isFinite(price) && price >= 0 && price <= 9_999_999 ? Math.round(price * 100) / 100 : null,
      discountLabel:
        typeof item.discountLabel === "string" && item.discountLabel.trim()
          ? item.discountLabel.trim().slice(0, 80)
          : undefined,
      discountType: item.discountType === "percent" ? "percent" : "fixed",
      discountAmount: Number.isFinite(discountAmount) && discountAmount >= 0
        ? Math.round(Math.min(discountAmount, item.discountType === "percent" ? 100 : 9_999_999) * 100) / 100
        : 0,
    };
  }
  const rawReinstallPrice: unknown = obj.reinstallPrice;
  const reinstallPrice = rawReinstallPrice == null || rawReinstallPrice === "" ? null : Number(rawReinstallPrice);
  const customServices: HolidayCustomService[] = Array.isArray(obj.customServices)
    ? obj.customServices.slice(0, 20).flatMap((rawService, index) => {
        if (!rawService || typeof rawService !== "object") return [];
        const service = rawService as Partial<HolidayCustomService>;
        const quantity = Number(service.quantity);
        const unitPrice = Number(service.unitPrice);
        return [{
          id: typeof service.id === "string" && service.id.trim()
            ? service.id.trim().slice(0, 80)
            : `service-${index + 1}`,
          sku:
            typeof service.sku === "string" && service.sku.trim()
              ? service.sku.trim().slice(0, 120)
              : undefined,
          name: typeof service.name === "string" ? service.name.slice(0, 120) : "",
          description:
            typeof service.description === "string"
              ? service.description.slice(0, 1000)
              : undefined,
          quantity:
            Number.isFinite(quantity) && quantity > 0
              ? Math.round(Math.min(quantity, 9_999) * 100) / 100
              : 1,
          unitPrice:
            Number.isFinite(unitPrice) && unitPrice >= 0
              ? Math.round(Math.min(unitPrice, 9_999_999) * 100) / 100
              : 0,
          unitCost:
            service.unitCost != null && Number.isFinite(Number(service.unitCost)) && Number(service.unitCost) >= 0
              ? Math.round(Math.min(Number(service.unitCost), 9_999_999) * 100) / 100
              : undefined,
        }];
      })
    : [];
  const leaseContractYears: HolidayLeaseContractYears =
    Number(obj.leaseContractYears) === 3
      ? 3
      : Number(obj.leaseContractYears) === 5
        ? 5
        : 1;
  const designOptions: HolidayQuoteDesignOption[] = Array.isArray(obj.designOptions)
    ? obj.designOptions.slice(0, MAX_ESTIMATE_OPTIONS).flatMap((rawOption, index) => {
        if (!rawOption || typeof rawOption !== "object") return [];
        const option = rawOption as Partial<HolidayQuoteDesignOption>;
        const nested = parseHolidaySelections(
          option.selections && typeof option.selections === "object"
            ? { ...option.selections, designOptions: undefined }
            : {}
        );
        return [{
          id: typeof option.id === "string" && option.id.trim()
            ? option.id.trim().slice(0, 80)
            : `option-${index + 1}`,
          label: typeof option.label === "string" && option.label.trim()
            ? option.label.trim().slice(0, 80)
            : `Option ${index + 1}`,
          previewImageUrl:
            typeof option.previewImageUrl === "string" && option.previewImageUrl.trim()
              ? option.previewImageUrl.trim()
              : undefined,
          previewPrompt: typeof option.previewPrompt === "string" ? option.previewPrompt.slice(0, 4000) : undefined,
          photoMarkup: parseHolidayPhotoMarkup(option.photoMarkup),
          measurements: parseHolidayMeasurements(option.measurements),
          selections: {
            defaultLightStyleKey: nested.defaultLightStyleKey,
            installKind: nested.installKind,
            billingMode: nested.billingMode ?? "standard",
            pricingMode: nested.pricingMode ?? "buy",
            defaultColorPattern: nested.defaultColorPattern,
            strandColor: nested.strandColor,
            notes: nested.notes,
            completedSteps: nested.completedSteps,
            optionAdjustments: nested.optionAdjustments,
            reinstallPrice: nested.reinstallPrice,
            customServices: nested.customServices,
            leaseContractYears: nested.leaseContractYears,
          },
        }];
      })
    : [];
  return {
    defaultLightStyleKey:
      obj.defaultLightStyleKey ?? DEFAULT_HOLIDAY_SELECTIONS.defaultLightStyleKey,
    installKind: parseInstallKind(obj.installKind),
    billingMode: obj.billingMode === "labor_only" ? "labor_only" : "standard",
    pricingMode:
      obj.pricingMode === "lease" || obj.pricingMode === "labor" || obj.pricingMode === "permanent"
        ? obj.pricingMode
        : obj.billingMode === "labor_only"
          ? "labor"
          : "buy",
    includeLaborOnlyOption: obj.includeLaborOnlyOption === true,
    includePermanentOption: obj.includePermanentOption === true,
    notes: typeof obj.notes === "string" ? obj.notes : undefined,
    completedSteps: Array.isArray(obj.completedSteps) ? [...new Set(obj.completedSteps.filter((step): step is string => typeof step === "string" && ["property", "options", "design", "photo", "price", "notes"].includes(step)))] : [],
    defaultColorPattern:
      typeof obj.defaultColorPattern === "string" && obj.defaultColorPattern.trim()
        ? obj.defaultColorPattern.trim()
        : "Warm White",
    strandColor: HOLIDAY_STRAND_COLORS.includes(obj.strandColor as HolidayStrandColor)
      ? obj.strandColor
      : "Green",
    optionAdjustments: adjustments,
    reinstallPrice: reinstallPrice != null && Number.isFinite(reinstallPrice) && reinstallPrice >= 0 && reinstallPrice <= 9_999_999
      ? Math.round(reinstallPrice * 100) / 100 : null,
    customServices,
    leaseContractYears,
    designOptions,
    activeDesignOptionId:
      typeof obj.activeDesignOptionId === "string" ? obj.activeDesignOptionId : undefined,
  };
}

export function holidayDesignOptionsFromQuote(params: {
  measurements: HolidayMeasurements;
  selections: HolidayQuoteSelections;
  catalog: HolidayLightingCatalog;
}): HolidayQuoteDesignOption[] {
  const { measurements, selections, catalog } = params;
  if (selections.designOptions?.length) {
    return selections.designOptions.slice(0, MAX_ESTIMATE_OPTIONS).map((option, index) => {
      const normalized = applyHolidayCatalogPolicy(
        { ...option.selections, designOptions: undefined },
        catalog
      );
      return {
        id: option.id,
        label: option.label || `Option ${index + 1}`,
        previewImageUrl: option.previewImageUrl,
        previewPrompt: option.previewPrompt,
        photoMarkup: parseHolidayPhotoMarkup(option.photoMarkup),
        measurements: parseHolidayMeasurements(option.measurements),
        selections: {
          defaultLightStyleKey: normalized.defaultLightStyleKey,
          installKind: normalized.installKind,
          billingMode: normalized.billingMode ?? "standard",
          pricingMode: normalized.pricingMode ?? "buy",
          defaultColorPattern: normalized.defaultColorPattern,
          strandColor: normalized.strandColor,
          notes: normalized.notes,
          completedSteps: normalized.completedSteps,
          optionAdjustments: normalized.optionAdjustments,
          reinstallPrice: normalized.reinstallPrice,
          customServices: normalized.customServices,
          leaseContractYears: normalized.leaseContractYears,
        },
      };
    });
  }
  const normalized = applyHolidayCatalogPolicy(selections, catalog);
  return [{
    id: "option-1",
    label: "Option 1",
    measurements: parseHolidayMeasurements(measurements),
    selections: {
      defaultLightStyleKey: normalized.defaultLightStyleKey,
      installKind: normalized.installKind,
      billingMode: normalized.billingMode ?? "standard",
      pricingMode: normalized.pricingMode ?? "buy",
      defaultColorPattern: normalized.defaultColorPattern,
      strandColor: normalized.strandColor,
      notes: normalized.notes,
      completedSteps: normalized.completedSteps,
      optionAdjustments: normalized.optionAdjustments,
      reinstallPrice: normalized.reinstallPrice,
      customServices: normalized.customServices,
      leaseContractYears: normalized.leaseContractYears,
    },
  }];
}

export function findPlacementCatalogItem(
  catalog: HolidayLightingCatalog,
  placement: Pick<HolidayMeasurementPlacement, "kind">
) {
  return catalog.placements.find((p) => p.kind === placement.kind) ?? null;
}
