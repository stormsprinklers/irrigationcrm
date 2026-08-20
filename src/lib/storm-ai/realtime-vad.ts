/**
 * Shared Storm AI realtime VAD / input-audio knobs.
 * Used by session mint (realtime.ts) and live session.update (realtime-client.ts).
 *
 * Higher threshold = less sensitive (better for truck / shop background noise).
 * OpenAI default threshold is 0.5; we stay well above that on purpose.
 */
export const STORM_AI_VAD_THRESHOLD = 0.9;
export const STORM_AI_VAD_PREFIX_PADDING_MS = 400;
export const STORM_AI_VAD_SILENCE_DURATION_MS = 1100;

/** Far-field NR helps when the mic is a phone/tablet in a noisy truck or shop. */
export const STORM_AI_INPUT_NOISE_REDUCTION = {
  type: "far_field" as const,
};

export function stormAiServerVad(opts: {
  createResponse: boolean;
  interruptResponse?: boolean;
}) {
  return {
    type: "server_vad" as const,
    threshold: STORM_AI_VAD_THRESHOLD,
    prefix_padding_ms: STORM_AI_VAD_PREFIX_PADDING_MS,
    silence_duration_ms: STORM_AI_VAD_SILENCE_DURATION_MS,
    interrupt_response: opts.interruptResponse ?? false,
    create_response: opts.createResponse,
  };
}
