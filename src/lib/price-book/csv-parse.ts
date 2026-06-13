export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && (char === "," || char === "\n" || char === "\r")) {
      row.push(cell);
      cell = "";
      if (char === ",") continue;
      if (char === "\r" && next === "\n") i++;
      if (row.some((value) => value.trim().length > 0)) rows.push(row);
      row = [];
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.trim().length > 0)) rows.push(row);

  if (rows.length === 0) return { headers: [], rows: [] };

  const headers = rows[0].map((h) => h.trim());
  return { headers, rows: rows.slice(1) };
}

export function parseCurrency(value: string | null | undefined): number | null {
  if (!value?.trim()) return null;
  const cleaned = value.replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

export function parseOptionalBoolean(value: string | null | undefined): boolean | null {
  if (!value?.trim()) return null;
  const normalized = value.trim().toLowerCase();
  if (["true", "yes", "1", "y"].includes(normalized)) return true;
  if (["false", "no", "0", "n"].includes(normalized)) return false;
  return null;
}

export function exportPriceBookCsv(
  headers: string[],
  rows: Array<Record<string, string | number | boolean | null | undefined>>
): string {
  const escape = (value: string) => {
    if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
    return value;
  };

  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => escape(String(row[header] ?? ""))).join(","));
  }
  return lines.join("\n");
}
