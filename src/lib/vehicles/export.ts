export type VehicleExportRow = {
  vehicleNumber: string | null;
  licensePlate: string | null;
  year: number;
  make: string;
  model: string;
  vin: string | null;
  currentMileage: number;
};

const HEADERS = [
  "Vehicle Number",
  "License Plate",
  "Year",
  "Make",
  "Model",
  "VIN",
  "Mileage",
] as const;

function csvCell(value: string | number | null) {
  let text = value == null ? "" : String(value);
  // Prevent spreadsheet programs from interpreting user-entered text as a formula.
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildVehicleExportCsv(rows: VehicleExportRow[]) {
  const lines = [
    HEADERS.map(csvCell).join(","),
    ...rows.map((vehicle) =>
      [
        vehicle.vehicleNumber,
        vehicle.licensePlate,
        vehicle.year,
        vehicle.make,
        vehicle.model,
        vehicle.vin,
        vehicle.currentMileage,
      ]
        .map(csvCell)
        .join(",")
    ),
  ];
  // BOM helps Excel recognize the file as UTF-8.
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
