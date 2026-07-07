import { readFile } from "fs/promises";
import { join } from "path";

/** Cached font for @vercel/og ImageResponse (Satori). Must be TTF/OTF — WOFF2 is not supported. */
let ogFontData: { name: string; data: ArrayBuffer } | null = null;

type FontCandidate = { name: string; path: string };

const FONT_CANDIDATES: FontCandidate[] = [
  {
    name: "Inter",
    path: join(process.cwd(), "public", "fonts", "inter-latin-400-normal.ttf"),
  },
  {
    name: "Noto Sans",
    path: join(process.cwd(), "public", "fonts", "noto-sans-latin-regular.ttf"),
  },
  {
    name: "Noto Sans",
    path: join(
      process.cwd(),
      "node_modules",
      "next",
      "dist",
      "compiled",
      "@vercel",
      "og",
      "noto-sans-v27-latin-regular.ttf"
    ),
  },
];

export async function getOgFont(): Promise<{ name: string; data: ArrayBuffer }> {
  if (ogFontData) return ogFontData;

  for (const candidate of FONT_CANDIDATES) {
    try {
      const buffer = await readFile(candidate.path);
      ogFontData = {
        name: candidate.name,
        data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
      };
      return ogFontData;
    } catch {
      // try next path
    }
  }

  throw new Error(
    "Failed to load a TTF font for review cards. Ensure public/fonts/inter-latin-400-normal.ttf is deployed."
  );
}

/** @deprecated Use getOgFont() — returns TTF bytes only. */
export async function getOgInterFont(): Promise<ArrayBuffer> {
  const font = await getOgFont();
  return font.data;
}

/** Strip emoji / symbol glyphs that can trigger failing dynamic font downloads in Satori. */
export function sanitizeOgText(text: string) {
  return text
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, "")
    .replace(/[\u2600-\u27BF]/gu, "")
    .replace(/\uFE0F/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
