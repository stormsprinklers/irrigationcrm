export function defaultEstimateVisitTitle(designExportMetadata: unknown) {
  const metadata =
    designExportMetadata && typeof designExportMetadata === "object"
      ? (designExportMetadata as Record<string, unknown>)
      : null;

  return metadata?.source === "holiday-lighting-quote"
    ? "Holiday Lighting Installation"
    : "Service Visit";
}
