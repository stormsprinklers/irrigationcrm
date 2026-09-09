import { MERGE_FIELDS } from "./templates";

/** `{customer_first_name}` or `{customer_first_name|there}` */
export const MERGE_TOKEN_PATTERN = /\{([a-z_]+)(?:\|([^}]*))?\}/g;

export type ParsedMergeToken = {
  raw: string;
  key: string;
  fallback: string;
  start: number;
  end: number;
};

export function sanitizeMergeFallback(value: string): string {
  return value.replace(/[{}|]/g, "").replace(/\s+/g, " ").trim();
}

export function formatMergeToken(key: string, fallback = ""): string {
  const fb = sanitizeMergeFallback(fallback);
  return fb ? `{${key}|${fb}}` : `{${key}}`;
}

export function parseMergeTokens(text: string): ParsedMergeToken[] {
  const out: ParsedMergeToken[] = [];
  const re = new RegExp(MERGE_TOKEN_PATTERN.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    out.push({
      raw: match[0],
      key: match[1],
      fallback: match[2] ?? "",
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return out;
}

export function findMergeTokenAt(text: string, index: number): ParsedMergeToken | null {
  return parseMergeTokens(text).find((token) => index >= token.start && index <= token.end) ?? null;
}

export function replaceMergeTokenFallback(
  text: string,
  token: ParsedMergeToken,
  fallback: string
): string {
  return text.slice(0, token.start) + formatMergeToken(token.key, fallback) + text.slice(token.end);
}

export function mergeTokenLabel(key: string): string {
  const token = `{${key}}`;
  return MERGE_FIELDS.find((field) => field.token === token)?.label ?? key.replace(/_/g, " ");
}

export function mergeTokenKeyFromInsert(token: string): string {
  return token.replace(/^\{/, "").replace(/\}$/, "").split("|")[0] ?? token;
}

/** Editor chips should not go out in the sent email. */
export function unwrapMergeTokenSpans(html: string): string {
  return html.replace(/<span\b[^>]*\bdata-merge-token=(['"])[^'"]*\1[^>]*>([\s\S]*?)<\/span>/gi, "$2");
}
