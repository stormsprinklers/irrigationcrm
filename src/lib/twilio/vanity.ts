/** Phone keypad map for vanity letter → digit preview. */
const VANITY_KEYPAD: Record<string, string> = {
  A: "2",
  B: "2",
  C: "2",
  D: "3",
  E: "3",
  F: "3",
  G: "4",
  H: "4",
  I: "4",
  J: "5",
  K: "5",
  L: "5",
  M: "6",
  N: "6",
  O: "6",
  P: "7",
  Q: "7",
  R: "7",
  S: "7",
  T: "8",
  U: "8",
  V: "8",
  W: "9",
  X: "9",
  Y: "9",
  Z: "9",
};

/**
 * Normalize a contains/vanity pattern for Twilio Available Numbers search.
 * Keeps digits, A–Z (Twilio maps letters to keypad), and `*` wildcards.
 */
export function normalizeContainsPattern(raw: string | null | undefined): string | undefined {
  const cleaned = String(raw ?? "")
    .toUpperCase()
    .replace(/[^0-9A-Z*]/g, "");
  return cleaned || undefined;
}

/** Convert vanity letters to digits for UI preview (2=ABC … 9=WXYZ). */
export function vanityLettersToDigits(raw: string): string {
  return String(raw ?? "")
    .toUpperCase()
    .replace(/[^0-9A-Z*]/g, "")
    .split("")
    .map((ch) => ((ch >= "0" && ch <= "9") || ch === "*" ? ch : VANITY_KEYPAD[ch] ?? ""))
    .join("");
}
