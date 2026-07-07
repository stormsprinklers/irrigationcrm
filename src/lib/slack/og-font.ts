import { readFile } from "fs/promises";
import { join } from "path";

/** Cached Inter font for @vercel/og ImageResponse (Satori). */
let interFontData: ArrayBuffer | null = null;

const INTER_FONT_PATHS = [
  join(process.cwd(), "public", "fonts", "inter-latin-400-normal.woff2"),
  join(
    process.cwd(),
    "node_modules",
    "@fontsource",
    "inter",
    "files",
    "inter-latin-400-normal.woff2"
  ),
];

export async function getOgInterFont(): Promise<ArrayBuffer> {
  if (interFontData) return interFontData;

  for (const fontPath of INTER_FONT_PATHS) {
    try {
      const buffer = await readFile(fontPath);
      interFontData = buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength
      );
      return interFontData;
    } catch {
      // try next path
    }
  }

  throw new Error(
    "Failed to load Inter font for review cards. Ensure public/fonts/inter-latin-400-normal.woff2 is deployed."
  );
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
