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
  "Other",
] as const;

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
  notes?: string;
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

export type HolidayQuoteDesignOption = {
  id: string;
  label: string;
  /** Option-specific customer preview. The source property photo remains quote-wide. */
  previewImageUrl?: string;
  measurements: HolidayMeasurements;
  selections: {
    defaultLightStyleKey: string;
    installKind: HolidayInstallKind;
    billingMode: HolidayQuoteBillingMode;
    pricingMode: HolidayQuotePricingMode;
    defaultColorPattern?: string;
    notes?: string;
    optionAdjustments?: Partial<Record<HolidayQuoteOptionKey, HolidayOptionAdjustment>>;
    reinstallPrice?: number | null;
    customServices?: HolidayCustomService[];
    leaseContractYears?: HolidayLeaseContractYears;
  };
};

export type HolidayCustomService = {
  id: string;
  name: string;
  description?: string;
  quantity: number;
  unitPrice: number;
};

export type HolidayQuoteOptionKey = "buy" | "lease" | "permanent" | "labor";
export type HolidayOptionAdjustment = {
  price?: number | null;
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
  peakSku?: string;
  peakLeaseSku?: string;
  liftRentalSku?: string;
  difficultyMultipliers?: HolidayDifficultyMultipliers;
  quoteDefaults?: HolidayQuoteDefaults;
};

export type HolidayCatalogSku = {
  sku: string;
  name: string;
  unit: "ft" | "each";
  defaultUnitPrice?: number;
};

export type HolidayPriceBookRow = HolidayCatalogSku & {
  unitPrice: number;
  unitCost: number | null;
  priceBookItemId: string | null;
};

export const DEFAULT_HOLIDAY_CATALOG: HolidayLightingCatalog = {
  lightStyles: [
    {
      key: "c9",
      label: "C9",
      temporaryYear1Sku: "HL-C9-PARTS-FT",
      temporaryReinstallSku: "HL-TEMP-INSTALL-FT",
      leaseSku: "HL-C9-LEASE-FT",
      permanentSku: "HL-PERM-FT",
      partsSku: "HL-C9-PARTS-FT",
      installSku: "HL-TEMP-INSTALL-FT",
      kind: "temporary",
    },
    {
      key: "c7",
      label: "C7",
      temporaryYear1Sku: "HL-C7-PARTS-FT",
      temporaryReinstallSku: "HL-TEMP-INSTALL-FT",
      leaseSku: "HL-C7-LEASE-FT",
      permanentSku: "HL-PERM-FT",
      partsSku: "HL-C7-PARTS-FT",
      installSku: "HL-TEMP-INSTALL-FT",
      kind: "temporary",
    },
    {
      key: "permanent",
      label: "Permanent",
      temporaryYear1Sku: "HL-PERM-FT",
      temporaryReinstallSku: "HL-PERM-SERVICE-FT",
      leaseSku: "HL-PERM-FT",
      permanentSku: "HL-PERM-FT",
      kind: "permanent",
    },
  ],
  placements: (["tree", "bush"] as const).map((kind) => {
    const prefix = kind === "tree" ? "TREE" : "BUSH";
    const legacyPartsSku = `HL-${prefix}-S`;
    return {
      key: `${kind}-strand`,
      kind,
      size: "small" as const,
      difficulty: 1 as const,
      label: `${kind === "tree" ? "Tree" : "Bush"} lighting / strand`,
      sku: legacyPartsSku,
      partsSku: legacyPartsSku,
      installSku: `${legacyPartsSku}-D1-LABOR`,
      leaseSku: `${legacyPartsSku}-D1-LEASE`,
    };
  }),
  liftRentalSku: "HL-LIFT-RENTAL",
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
    temporaryYear1Sku:
      obj.temporaryYear1Sku || obj.partsSku || fallback.temporaryYear1Sku,
    temporaryReinstallSku:
      obj.temporaryReinstallSku || obj.installSku || fallback.temporaryReinstallSku,
    leaseSku: obj.leaseSku || fallback.leaseSku,
    permanentSku: obj.permanentSku || fallback.permanentSku,
    partsSku: obj.partsSku || fallback.partsSku,
    installSku: obj.installSku || fallback.installSku,
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
    sku: typeof obj.sku === "string" && obj.sku ? obj.sku : fallback.sku,
    leaseSku: typeof obj.leaseSku === "string" && obj.leaseSku ? obj.leaseSku : fallback.leaseSku,
    difficulty,
    partsSku: typeof obj.partsSku === "string" && obj.partsSku ? obj.partsSku : obj.sku || fallback.partsSku || fallback.sku,
    installSku: typeof obj.installSku === "string" && obj.installSku ? obj.installSku : fallback.installSku,
  };
}

export function parseHolidayCatalog(raw: unknown): HolidayLightingCatalog {
  if (!raw || typeof raw !== "object") return DEFAULT_HOLIDAY_CATALOG;
  const obj = raw as Partial<HolidayLightingCatalog>;
  const hasCurrentStyles = Array.isArray(obj.lightStyles) && ["c9", "c7", "permanent"].every(
    (key) => obj.lightStyles!.some((style) => style && typeof style === "object" && (style as HolidayLightStyle).key === key)
  );
  const styles =
    hasCurrentStyles
      ? (obj.lightStyles as HolidayLightStyle[]).map((style, i) =>
          parseLightStyle(style, DEFAULT_HOLIDAY_CATALOG.lightStyles[i] ?? DEFAULT_HOLIDAY_CATALOG.lightStyles[0]!)
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
    liftRentalSku: typeof obj.liftRentalSku === "string" && obj.liftRentalSku.trim()
      ? obj.liftRentalSku.trim()
      : DEFAULT_HOLIDAY_CATALOG.liftRentalSku,
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
    defaultUnitPrice?: number
  ) {
    const code = sku?.trim();
    if (!code || seen.has(code)) return;
    seen.add(code);
    rows.push({ sku: code, name, unit, defaultUnitPrice });
  }
  for (const style of catalog.lightStyles) {
    if (style.kind !== "permanent") {
      add(style.partsSku ?? style.temporaryYear1Sku, `${style.label} bulbs and materials / ft`, "ft", style.key === "c9" ? 2.25 : 2.15);
      add(style.installSku ?? style.temporaryReinstallSku, "Temporary lighting installation and take-down / ft", "ft", 2.99);
      add(style.leaseSku, `${style.label} — lease, seasonal / ft`, "ft", style.key === "c9" ? 4.59 : 4.29);
    }
    if (style.kind === "permanent") {
      add(style.permanentSku, `${style.label} lighting / ft`, "ft", 25);
    }
  }
  for (const placement of catalog.placements) {
    add(placement.partsSku ?? placement.sku, `${placement.label} — parts`, "each");
    add(placement.installSku, `${placement.label} — labor`, "each");
    add(placement.leaseSku, `${placement.label} — lease`, "each");
  }
  add(catalog.liftRentalSku, "Lift rental (internal; folded into tree price)", "each");
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
  return {
    defaultLightStyleKey: style?.key ?? d.defaultLightStyleKey,
    installKind: style?.kind === "permanent" ? "permanent" : "temporary",
    billingMode: "standard",
    pricingMode:
      style?.kind === "permanent"
        ? "permanent"
        : selections.pricingMode === "lease" || selections.pricingMode === "labor"
          ? selections.pricingMode
          : selections.billingMode === "labor_only"
            ? "labor"
            : "buy",
    includeLaborOnlyOption:
      style?.kind !== "permanent"
        ? Boolean(selections.includeLaborOnlyOption || selections.billingMode === "labor_only")
        : false,
    includePermanentOption:
      style?.kind !== "permanent"
        ? Boolean(selections.includePermanentOption)
        : false,
    notes: selections.notes,
    defaultColorPattern: selections.defaultColorPattern?.trim() || "Warm White",
    optionAdjustments: selections.optionAdjustments,
    reinstallPrice: selections.reinstallPrice,
    customServices: selections.customServices,
    leaseContractYears: selections.leaseContractYears ?? 1,
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
          lightStyleKey: (placement as HolidayMeasurementPlacement).lightStyleKey || "c9",
          colorPattern: (placement as HolidayMeasurementPlacement).colorPattern || "Warm White",
        });
        })
      : [],
    streetTraces: Array.isArray(obj.streetTraces) ? obj.streetTraces : [],
    strands,
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
    ? obj.designOptions.slice(0, 5).flatMap((rawOption, index) => {
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
          measurements: parseHolidayMeasurements(option.measurements),
          selections: {
            defaultLightStyleKey: nested.defaultLightStyleKey,
            installKind: nested.installKind,
            billingMode: nested.billingMode ?? "standard",
            pricingMode: nested.pricingMode ?? "buy",
            defaultColorPattern: nested.defaultColorPattern,
            notes: nested.notes,
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
    defaultColorPattern:
      typeof obj.defaultColorPattern === "string" && obj.defaultColorPattern.trim()
        ? obj.defaultColorPattern.trim()
        : "Warm White",
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
    return selections.designOptions.slice(0, 5).map((option, index) => {
      const normalized = applyHolidayCatalogPolicy(
        { ...option.selections, designOptions: undefined },
        catalog
      );
      return {
        id: option.id,
        label: option.label || `Option ${index + 1}`,
        previewImageUrl: option.previewImageUrl,
        measurements: parseHolidayMeasurements(option.measurements),
        selections: {
          defaultLightStyleKey: normalized.defaultLightStyleKey,
          installKind: normalized.installKind,
          billingMode: normalized.billingMode ?? "standard",
          pricingMode: normalized.pricingMode ?? "buy",
          defaultColorPattern: normalized.defaultColorPattern,
          notes: normalized.notes,
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
      notes: normalized.notes,
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
