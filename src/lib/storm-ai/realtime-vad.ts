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

/**
 * After the model finishes speaking, keep the mic gated and create_response off
 * long enough that speaker echo cannot start a fake user turn.
 */
export const STORM_AI_ECHO_GUARD_MS = 1500;

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

/**
 * Short acks / closings that speaker-phone echo commonly hallucinates from the
 * model's own goodbye/thanks cadence. Do not treat these as real user turns.
 */
export const SHORT_ACK_RE =
  /^(ok|okay|yes|yeah|yep|yup|no|nope|thanks|thank you|thank you\.|got it|alright|all right|continue|next|done|copy|uh-huh|mm-hmm|bye|bye-bye|bye bye|goodbye|good bye|see you|you'?re welcome|ok thanks|okay thanks)[\s.!?]*$/i;

/** @deprecated Use SHORT_ACK_RE — kept as alias for camera-frame skip logic. */
export const VIDEO_SKIP_FRAME_RE = SHORT_ACK_RE;

/**
 * Only fire the client parts-search fallback when the model clearly said it is
 * searching the parts library — not generic "let me check" diagnostic speech.
 */
export const SEARCHING_SPEECH_RE =
  /\b((let me |i('ll| will) )?(search(ing)?|look(ing)? up) (the |our |your |that |this |a )?(parts?( list| library| catalog| info)?|library|catalog)|(search(ing)?|look(ing)? up) (for )?(the |a |that |this )?part|parts (list|library|info|catalog))\b/i;

export function isShortAckTranscript(transcript: string): boolean {
  return SHORT_ACK_RE.test(transcript.trim());
}

export function isPartsSearchIntentSpeech(transcript: string): boolean {
  return SEARCHING_SPEECH_RE.test(transcript);
}
