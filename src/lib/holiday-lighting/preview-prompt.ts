import { applyHolidayCatalogPolicy, parseHolidayMeasurements, type HolidayQuoteDesignOption, type HolidayLightingCatalog } from "./types";

function styleRenderingInstruction(styleKey: string, styleLabel: string) {
  if (styleKey === "mini" || /mini/i.test(styleLabel)) {
    return "Render mini LED string lights: many small, closely spaced points of light wrapped neatly through the tree or bush. Never use C7 or C9 bulb shapes on trees or bushes.";
  }
  if (styleKey === "permanent" || /permanent/i.test(styleLabel)) {
    return "Render sleek, low-profile permanent architectural LEDs tucked tightly under the fascia/soffit in a concealed channel. Use small, closely spaced, crisp points of light that trace the architecture cleanly. Do not render removable C7/C9 bulb shapes, visible clips, hanging wire, or bulky sockets.";
  }
  if (styleKey === "c7" || /c7/i.test(styleLabel)) {
    return "Render authentic C7 LEDs: traditional faceted teardrop bulbs that are visibly smaller and a little less bright than C9 bulbs, consistently spaced and neatly clipped.";
  }
  return "Render authentic C9 LEDs: large, bright, faceted teardrop bulbs with a bold classic roofline appearance, consistently spaced and neatly clipped. They must look clearly larger and brighter than C7 bulbs.";
}

function colorRenderingInstruction(colorPattern: string) {
  const color = colorPattern.trim() || "Warm White";
  if (/winter white/i.test(color)) return "Winter White must be a crisp, cool neutral white with no amber/yellow cast.";
  if (/warm white/i.test(color)) return "Warm White must have a soft warm ivory/golden tone, visibly warmer than Winter White.";
  if (/champagne/i.test(color)) return "Champagne must be an elegant pale warm-gold tone, subtler than yellow and distinct from Warm White.";
  return `Reproduce this requested color or repeating pattern accurately and consistently: ${color}.`;
}

function optionVisualPlan(
  option: HolidayQuoteDesignOption,
  catalog: HolidayLightingCatalog
) {
  const selections = applyHolidayCatalogPolicy(option.selections, catalog);
  const measurements = parseHolidayMeasurements(option.measurements);
  const combinations = new Map<string, { styleKey: string; styleLabel: string; color: string }>();
  for (const item of [...measurements.segments, ...measurements.placements]) {
    const styleKey = item.lightStyleKey ?? selections.defaultLightStyleKey;
    const styleLabel = styleKey === "mini"
      ? "Mini LEDs"
      : catalog.lightStyles.find((style) => style.key === styleKey)?.label ?? styleKey;
    const color = item.colorPattern ?? selections.defaultColorPattern ?? "Warm White";
    combinations.set(`${styleKey}\u0000${color}`, { styleKey, styleLabel, color });
  }
  if (!combinations.size) {
    const styleKey = selections.defaultLightStyleKey;
    combinations.set(styleKey, {
      styleKey,
      styleLabel: catalog.lightStyles.find((style) => style.key === styleKey)?.label ?? styleKey,
      color: selections.defaultColorPattern ?? "Warm White",
    });
  }
  const appearanceRules = [...combinations.values()].map((item, index) =>
    `${index + 1}. ${item.styleLabel}, ${item.color}: ${styleRenderingInstruction(item.styleKey, item.styleLabel)} ${colorRenderingInstruction(item.color)}`
  ).join("\n");
  const layout = [
    ...measurements.segments.map((segment) => {
      const styleKey = segment.lightStyleKey ?? selections.defaultLightStyleKey;
      const styleLabel = styleKey === "mini"
        ? "Mini LEDs"
        : catalog.lightStyles.find((style) => style.key === styleKey)?.label ?? styleKey;
      return `Roofline "${segment.label}": ${styleLabel}, ${segment.colorPattern ?? selections.defaultColorPattern ?? "Warm White"}`;
    }),
    ...measurements.placements.map((placement) => {
      const styleKey = placement.lightStyleKey ?? selections.defaultLightStyleKey;
      const styleLabel = "Mini LEDs";
      return `${placement.kind === "tree" ? "Tree" : "Bush"} "${placement.label}": ${placement.strandCount ?? 1} strand(s), ${styleLabel}, ${placement.colorPattern ?? selections.defaultColorPattern ?? "Warm White"}`;
    }),
  ].slice(0, 40).map((line) => `- ${line}`).join("\n");
  return `LIGHT APPEARANCE RULES:\n${appearanceRules}\n\nOPTION LAYOUT:\n${layout || "- Use the selected specification on the visible front roofline."}`;
}

export function lightingPrompt(option: HolidayQuoteDesignOption, catalog: HolidayLightingCatalog) {
  return `Create a photorealistic holiday lighting preview using the supplied clean photograph of this exact house.
Preserve the actual architecture, roof edges, windows, landscaping, driveway, viewpoint and proportions. You may naturally relight the full scene to blue-hour dusk so the installed lights are visible.
Use the option specifications below as defaults. The employee's preview instructions take priority for colors and which areas receive lights. Interpret named architectural areas from the photograph and align lights to the real roof edges and features; use measurements as context for scope, not pixel coordinates.

${optionVisualPlan(option, catalog)}

EMPLOYEE PREVIEW INSTRUCTIONS:
${option.previewPrompt?.trim() || "Light the visible front roofline using the selected bulb type and color. Leave trees, bushes, windows and other areas unlit unless included in the option layout."}

Render individual realistic LED bulbs, small sockets, subtle clips and fine dark wire, with dark gaps between bulbs and restrained natural glow. Avoid continuous glowing ribbons, painted lines, neon tubes, oversaturated halos and illustration effects. Keep C7, C9, mini and permanent architectural lights visually appropriate to their actual construction and scale.
Do not add lights to unrelated trees or other unrequested areas. Do not add people, cars, snow, wreaths, text, logos or watermarks. Return one complete AI-generated photograph of the finished installation.`;
}
