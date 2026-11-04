export type HolidayScheduleExportRow = {
  date: string;
  time: string;
  customerName: string;
  technicians: string;
  address: string;
  strandColor: string;
  footageCount: number | null;
  lightColorPattern: string;
};

const HEADERS = [
  "Date",
  "Time",
  "Customer Name",
  "Technician(s)",
  "Address",
  "Strand Color",
  "Footage Count",
  "Light Color / Pattern",
] as const;

function csvCell(value: string | number | null) {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildHolidayScheduleCsv(rows: HolidayScheduleExportRow[]) {
  const lines = [
    HEADERS.map(csvCell).join(","),
    ...rows.map((row) => [
      row.date,
      row.time,
      row.customerName,
      row.technicians,
      row.address,
      row.strandColor,
      row.footageCount,
      row.lightColorPattern,
    ].map(csvCell).join(",")),
  ];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
