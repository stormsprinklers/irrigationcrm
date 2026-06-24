export function formatPartsListText(params: {
  projectName: string;
  bom: Array<Record<string, unknown>>;
  manHours: number | null;
}) {
  const lines = [
    `Parts list — ${params.projectName}`,
    `Generated ${new Date().toLocaleString()}`,
    "",
  ];

  if (params.manHours != null) {
    lines.push(`Estimated install hours: ${params.manHours}`, "");
  }

  lines.push("SKU / Description".padEnd(40) + "Qty".padStart(8) + "Unit".padStart(8));
  lines.push("-".repeat(56));

  for (const item of params.bom) {
    const desc = String(item.description ?? "Item");
    const qty = String(item.quantity ?? "");
    const unit = String(item.unit ?? "ea");
    lines.push(desc.slice(0, 40).padEnd(40) + qty.padStart(8) + unit.padStart(8));
  }

  return lines.join("\n");
}
