import { applyHolidayCatalogPolicy, type HolidayQuoteDesignOption, type HolidayLightingCatalog } from "./types";

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
  const styleKey = selections.defaultLightStyleKey;
  const styleLabel = catalog.lightStyles.find((style) => style.key === styleKey)?.label ?? styleKey;
  const color = selections.defaultColorPattern ?? "Warm White";
  return `LIGHT APPEARANCE RULES:\n${styleLabel}, ${color}: ${styleRenderingInstruction(styleKey, styleLabel)} ${colorRenderingInstruction(color)}\n\nPLACEMENT RULE:\nApply this specification to every painted line in IMAGE 2. The painted lines alone control placement; do not use quote measurements to add or move lights.`;
}

export function lightingPrompt(option: HolidayQuoteDesignOption, catalog: HolidayLightingCatalog) {
  return `You are given two images of the same residential property. IMAGE 1 is the clean property photograph. IMAGE 2 is the same photograph with employee-painted guide lines. Preserve the actual architecture, roof edges, windows, landscaping, driveway, viewpoint and proportions.

The painted guide lines in IMAGE 2 are the only places that should receive holiday lighting. Do not infer placement from measurements, labels, or unmarked architectural features. Replace the paint with realistic installed lights and remove every trace of the painted guide from the finished image.

${optionVisualPlan(option, catalog)}

Render individual realistic LED bulbs, small sockets, subtle clips and fine dark wire, with dark gaps between bulbs and restrained natural glow. Avoid continuous glowing ribbons, painted lines, neon tubes, oversaturated halos and illustration effects. Keep C7, C9, mini and permanent architectural lights visually appropriate to their actual construction and scale.
Relight the scene to attractive blue-hour dusk, add a little fresh snow and a tasteful front-door wreath where appropriate, and keep ordinary porch, garage and interior window lights on. Do not add people, extra cars, text, logos or watermarks. Return one complete photorealistic image of the finished installation.`;
}
