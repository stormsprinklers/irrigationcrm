import { stormBrand } from "@/lib/branding";

/** Full company brand palette — CRM chrome + email AI. */
export type BrandPalette = {
  /** Buttons, links, active nav → `--primary` */
  primary: string;
  /** Main text / navy-style → `--foreground` */
  secondary: string;
  /** Soft fills (secondary buttons, home card tint) → `--secondary` / `--highlight` */
  soft: string;
  /** Lighter panel backgrounds → `--highlight-panel` */
  panel: string;
  /** Optional accent (email CTAs, highlights) */
  accent: string | null;
  /** Extra swatches for email / design */
  extras: string[];
};

export const DEFAULT_BRAND_PALETTE: BrandPalette = {
  primary: stormBrand.sky,
  secondary: stormBrand.navy,
  soft: stormBrand.ice,
  panel: "#E8F4FA",
  accent: stormBrand.coral,
  extras: ["#FFFFFF"],
};

export function normalizeHex(value: string | null | undefined, fallback: string): string {
  const raw = (value ?? "").trim();
  if (!raw) return fallback;
  const withHash = raw.startsWith("#") ? raw : `#${raw}`;
  if (!/^#[0-9a-fA-F]{6}$/.test(withHash)) return fallback;
  return withHash.toUpperCase();
}

export function normalizeOptionalHex(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const withHash = raw.startsWith("#") ? raw : `#${raw}`;
  if (!/^#[0-9a-fA-F]{6}$/.test(withHash)) return null;
  return withHash.toUpperCase();
}

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** Mix a brand color toward white (0 = original, 1 = white). */
export function mixWithWhite(hex: string, amount: number) {
  const { r, g, b } = hexToRgb(hex);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `#${[mix(r), mix(g), mix(b)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}

export function contrastForeground(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.55 ? "#102341" : "#FFFFFF";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Parse stored JSON + legacy primary/secondary into a complete palette. */
export function resolveBrandPalette(input: {
  brandPrimaryColor?: string | null;
  brandSecondaryColor?: string | null;
  brandPalette?: unknown;
}): BrandPalette {
  const raw = isRecord(input.brandPalette) ? input.brandPalette : {};
  const primary = normalizeHex(
    (typeof raw.primary === "string" ? raw.primary : null) ?? input.brandPrimaryColor,
    DEFAULT_BRAND_PALETTE.primary
  );
  const secondary = normalizeHex(
    (typeof raw.secondary === "string" ? raw.secondary : null) ?? input.brandSecondaryColor,
    DEFAULT_BRAND_PALETTE.secondary
  );
  const soft = normalizeHex(
    typeof raw.soft === "string" ? raw.soft : null,
    mixWithWhite(primary, 0.82)
  );
  const panel = normalizeHex(
    typeof raw.panel === "string" ? raw.panel : null,
    mixWithWhite(primary, 0.92)
  );
  const accent =
    raw.accent === null || raw.accent === ""
      ? null
      : normalizeOptionalHex(typeof raw.accent === "string" ? raw.accent : null) ??
        DEFAULT_BRAND_PALETTE.accent;
  const extras = Array.isArray(raw.extras)
    ? raw.extras
        .map((c) => (typeof c === "string" ? normalizeOptionalHex(c) : null))
        .filter((c): c is string => Boolean(c))
    : [...DEFAULT_BRAND_PALETTE.extras];

  return { primary, secondary, soft, panel, accent, extras };
}

/** Normalize a palette from the settings form before save. */
export function sanitizeBrandPalette(input: Partial<BrandPalette> | null | undefined): BrandPalette {
  const primary = normalizeHex(input?.primary, DEFAULT_BRAND_PALETTE.primary);
  const secondary = normalizeHex(input?.secondary, DEFAULT_BRAND_PALETTE.secondary);
  return {
    primary,
    secondary,
    soft: normalizeHex(input?.soft, mixWithWhite(primary, 0.82)),
    panel: normalizeHex(input?.panel, mixWithWhite(primary, 0.92)),
    accent: normalizeOptionalHex(input?.accent ?? null),
    extras: (input?.extras ?? [])
      .map((c) => normalizeOptionalHex(c))
      .filter((c): c is string => Boolean(c)),
  };
}

/** Flatten palette into the list used by email AI. */
export function brandPaletteToEmailSwatches(palette: BrandPalette): {
  primary: string;
  secondary: string;
  extras: string[];
} {
  const extras = [palette.soft, palette.panel, palette.accent, ...palette.extras]
    .filter((c): c is string => Boolean(c))
    .filter((c, i, arr) => arr.indexOf(c) === i)
    .filter((c) => c !== palette.primary && c !== palette.secondary);
  return {
    primary: palette.primary,
    secondary: palette.secondary,
    extras,
  };
}
