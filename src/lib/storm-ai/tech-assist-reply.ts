import type { StormAiToolResult } from "./types";

/** Build a short technician-facing reply from a tech-assist tool payload. */
export function formatTechAssistAssistantText(
  result: StormAiToolResult | null
): string | null {
  if (!result?.ok || !result.data || typeof result.data !== "object") return null;
  const data = result.data as {
    unmatched?: boolean;
    active?: boolean;
    step?: {
      type?: string;
      title?: string;
      test?: string;
      instructions?: string;
      tips?: string | null;
      options?: Array<{ label: string }> | null;
      choices?: string[] | null;
      done?: boolean;
    };
  };
  if (data.active === false) return null;
  const step = data.step;
  if (!step) return null;

  const optionLabels =
    (Array.isArray(step.options) && step.options.length
      ? step.options.map((o) => o.label)
      : null) ??
    (Array.isArray(step.choices) && step.choices.length ? step.choices : null);

  if (data.unmatched) {
    const opts = optionLabels?.length
      ? optionLabels.map((label) => `- ${label}`).join("\n")
      : null;
    return opts
      ? `I couldn’t match that to one of the options for this step. Please choose one:\n${opts}`
      : "I couldn’t match that answer to this step. Can you restate it using the options above?";
  }

  if (step.type === "RESOLUTION" || step.done) {
    const instructions = (step.instructions || step.test || "").trim();
    return instructions
      ? `Resolution: ${step.title ? `${step.title} — ` : ""}${instructions}`
      : "That’s the end of this diagnostic path.";
  }

  const test = (step.test || step.instructions || "").trim();
  if (!test && !step.title) return null;
  const lines = [
    step.title ? `Next check: ${step.title}` : "Next check:",
    test || null,
    step.tips?.trim() ? `Tip: ${step.tips.trim()}` : null,
    optionLabels?.length
      ? `Options:\n${optionLabels.map((label) => `- ${label}`).join("\n")}`
      : null,
  ].filter(Boolean);
  return lines.join("\n");
}
