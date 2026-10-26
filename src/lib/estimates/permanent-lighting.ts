type PermanentLightingEstimateLike = {
  designExportMetadata?: unknown;
  options?: Array<{
    label?: string | null;
    pricingMode?: string | null;
  }>;
  lineItems?: Array<{
    name?: string | null;
  }>;
};

function permanentLightingText(value: string | null | undefined) {
  return /\bpermanent\s+(?:holiday\s+)?(?:lights?|lighting)\b/i.test(value?.trim() ?? "");
}

/** True only when an estimate contains a permanent-lighting option. */
export function hasPermanentLightingOption(estimate: PermanentLightingEstimateLike) {
  if (
    estimate.options?.some(
      (option) =>
        option.pricingMode?.trim().toLowerCase() === "permanent" ||
        permanentLightingText(option.label)
    )
  ) {
    return true;
  }

  const metadata =
    estimate.designExportMetadata && typeof estimate.designExportMetadata === "object"
      ? (estimate.designExportMetadata as Record<string, unknown>)
      : null;
  const metadataOptions = Array.isArray(metadata?.options) ? metadata.options : [];
  if (
    metadataOptions.some(
      (option) =>
        Boolean(option) &&
        typeof option === "object" &&
        (option as Record<string, unknown>).pricingMode === "permanent"
    )
  ) {
    return true;
  }

  return Boolean(estimate.lineItems?.some((item) => permanentLightingText(item.name)));
}
