import { createTextPdf } from "@/lib/design/minimal-pdf";
import { formatPartsListText } from "@/lib/design/parts-list";

export function buildPartsListPdf(params: {
  projectName: string;
  bom: Array<Record<string, unknown>>;
  manHours: number | null;
}): Buffer {
  const text = formatPartsListText(params);
  return createTextPdf(text.split("\n"));
}
