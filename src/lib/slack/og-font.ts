/** Cached Inter font for @vercel/og ImageResponse (avoids dynamic font fetch failures). */
let interFontData: ArrayBuffer | null = null;

const INTER_FONT_URL =
  "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZ9hjp-Ek-_EeA.woff2";

export async function getOgInterFont() {
  if (interFontData) return interFontData;
  const res = await fetch(INTER_FONT_URL);
  if (!res.ok) {
    throw new Error(`Failed to load Inter font for review cards (${res.status})`);
  }
  interFontData = await res.arrayBuffer();
  return interFontData;
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
