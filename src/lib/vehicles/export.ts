import { formatEstimatedValue } from "./inventory";

export type VehicleExportRow = {
  make: string;
  model: string;
  year: number;
  vin: string | null;
  currentMileage: number;
  estimatedValueCents: number | null;
};

const PAGE_WIDTH = 792;
const PAGE_HEIGHT = 612;
const MARGIN = 36;
const ROW_HEIGHT = 24;
const HEADER_Y = 524;
const ROWS_PER_PAGE = 18;
const COLUMNS = [
  { label: "Make", x: 36, width: 105, align: "left" },
  { label: "Model", x: 141, width: 140, align: "left" },
  { label: "Year", x: 281, width: 50, align: "left" },
  { label: "Mileage", x: 331, width: 90, align: "right" },
  { label: "VIN", x: 421, width: 205, align: "left" },
  { label: "Est. Value", x: 626, width: 130, align: "right" },
] as const;

function pdfText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function fitText(value: string, width: number, fontSize = 9) {
  const maxCharacters = Math.max(1, Math.floor((width - 12) / (fontSize * 0.52)));
  if (value.length <= maxCharacters) return value;
  return `${value.slice(0, Math.max(1, maxCharacters - 3))}...`;
}

function textWidth(value: string, fontSize = 9) {
  return value.length * fontSize * 0.52;
}

function drawText(
  value: string,
  x: number,
  y: number,
  options?: { bold?: boolean; size?: number }
) {
  const font = options?.bold ? "F2" : "F1";
  const size = options?.size ?? 9;
  return `BT /${font} ${size} Tf ${x.toFixed(1)} ${y.toFixed(1)} Td (${pdfText(value)}) Tj ET`;
}

function pageContent(rows: VehicleExportRow[], totalRows: number, page: number, pageCount: number) {
  const commands: string[] = [
    "0.12 0.18 0.28 rg",
    drawText("Vehicle & Equipment Inventory", MARGIN, 570, { bold: true, size: 18 }),
    "0.35 0.40 0.48 rg",
    drawText(`Selected inventory - ${totalRows} item${totalRows === 1 ? "" : "s"}`, MARGIN, 550, { size: 9 }),
    "0.93 0.95 0.97 rg",
    `${MARGIN} ${HEADER_Y} ${PAGE_WIDTH - MARGIN * 2} 26 re f`,
    "0.15 0.20 0.28 rg",
  ];

  for (const column of COLUMNS) {
    const x = column.align === "right"
      ? column.x + column.width - 6 - textWidth(column.label, 9)
      : column.x + 6;
    commands.push(drawText(column.label, x, HEADER_Y + 9, { bold: true }));
  }

  rows.forEach((row, index) => {
    const y = HEADER_Y - (index + 1) * ROW_HEIGHT;
    if (index % 2 === 1) {
      commands.push("0.975 0.98 0.985 rg", `${MARGIN} ${y} ${PAGE_WIDTH - MARGIN * 2} ${ROW_HEIGHT} re f`);
    }
    commands.push("0.25 0.28 0.33 RG", "0.25 w", `${MARGIN} ${y} m ${PAGE_WIDTH - MARGIN} ${y} l S`);
    commands.push("0.12 0.15 0.20 rg");

    const values = [
      row.make || "-",
      row.model || "-",
      String(row.year),
      row.currentMileage.toLocaleString("en-US"),
      row.vin || "-",
      row.estimatedValueCents == null ? "-" : formatEstimatedValue(row.estimatedValueCents),
    ];

    COLUMNS.forEach((column, columnIndex) => {
      const fitted = fitText(values[columnIndex]!, column.width);
      const x = column.align === "right"
        ? column.x + column.width - 6 - textWidth(fitted)
        : column.x + 6;
      commands.push(drawText(fitted, x, y + 8));
    });
  });

  commands.push(
    "0.45 0.48 0.53 rg",
    drawText(`Page ${page} of ${pageCount}`, PAGE_WIDTH - MARGIN - 54, 24, { size: 8 }),
    drawText("Estimated values are informational estimates.", MARGIN, 24, { size: 8 })
  );
  return commands.join("\n");
}

function asciiBytes(value: string) {
  return new TextEncoder().encode(value);
}

/** Build a dependency-free, landscape Letter PDF containing the selected inventory rows. */
export function buildVehicleInventoryPdf(rows: VehicleExportRow[]) {
  const chunks: VehicleExportRow[][] = [];
  for (let index = 0; index < rows.length; index += ROWS_PER_PAGE) {
    chunks.push(rows.slice(index, index + ROWS_PER_PAGE));
  }
  if (chunks.length === 0) chunks.push([]);

  const pageCount = chunks.length;
  const firstPageObject = 5;
  const objects: string[] = [];
  const pageReferences = chunks.map((_, index) => `${firstPageObject + index * 2} 0 R`);
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageReferences.join(" ")}] /Count ${pageCount} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";

  chunks.forEach((pageRows, index) => {
    const pageObject = firstPageObject + index * 2;
    const contentObject = pageObject + 1;
    const content = pageContent(pageRows, rows.length, index + 1, pageCount);
    objects[pageObject] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObject} 0 R >>`;
    objects[contentObject] = `<< /Length ${asciiBytes(content).length} >>\nstream\n${content}\nendstream`;
  });

  let pdf = "%PDF-1.4\n%PDFGEN\n";
  const offsets = [0];
  for (let index = 1; index < objects.length; index += 1) {
    offsets[index] = asciiBytes(pdf).length;
    pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = asciiBytes(pdf).length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let index = 1; index < objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return asciiBytes(pdf);
}
