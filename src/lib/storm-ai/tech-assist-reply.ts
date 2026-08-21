import type { StormAiToolResult } from "./types";

type TechAssistStep = {
  type?: string;
  title?: string;
  test?: string;
  instructions?: string;
  tips?: string | null;
  options?: Array<{ label: string }> | null;
  choices?: string[] | null;
  done?: boolean;
};

function unwrapTechAssistData(result: unknown): {
  unmatched?: boolean;
  step?: TechAssistStep;
} | null {
  if (!result || typeof result !== "object") return null;
  const root = result as Record<string, unknown>;
  if (root.ok === false) return null;
  const data =
    root.ok === true && root.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>)
      : root;
  if (!data.step || typeof data.step !== "object") return null;
  return {
    unmatched: Boolean(data.unmatched),
    step: data.step as TechAssistStep,
  };
}

/** Short technician-facing text from a tech-assist tool payload (chat or voice). */
export function formatTechAssistAssistantText(
  result: StormAiToolResult | null
): string | null {
  if (!result?.ok) return null;
  const data = unwrapTechAssistData(result);
  if (!data?.step) return null;
  const step = data.step;

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

/** Instructions for realtime response.create after a tech-assist tool. */
export function buildTechAssistSpeakInstructions(result: unknown): string | null {
  const asTool =
    result && typeof result === "object" && "ok" in (result as object)
      ? (result as StormAiToolResult)
      : ({ ok: true, data: result } as StormAiToolResult);
  const text = formatTechAssistAssistantText(asTool.ok ? asTool : null);
  if (!text) return null;
  const data = unwrapTechAssistData(asTool);
  if (data?.unmatched) {
    return `You must speak now. The technician's answer did not match an option. Ask them to choose clearly. Say: ${text}`;
  }
  if (data?.step?.type === "RESOLUTION" || data?.step?.done) {
    return `You must speak now — do not stay silent. Tell the technician the resolution in one or two short sentences, then stop and listen: ${text}`;
  }
  return `You must speak now. Ask only the next diagnostic check in one or two short sentences, then stop and listen: ${text}`;
}
