export type VoiceSdkErrorLike = {
  code?: number;
  message?: string;
};

const TOKEN_ERROR_CODES = new Set([20101, 20104, 31204, 31205]);
const TRANSIENT_TRANSPORT_ERROR_CODES = new Set([31000, 31003, 31005, 31009]);

export function isVoiceTokenError(error: VoiceSdkErrorLike) {
  return (
    (typeof error.code === "number" && TOKEN_ERROR_CODES.has(error.code)) ||
    /access.?token/i.test(error.message ?? "")
  );
}

/**
 * Twilio reports WebSocket/signaling interruptions with these general codes.
 * They are expected when a browser tab sleeps or a device changes networks and
 * should trigger transport recovery instead of exposing the SDK text to staff.
 */
export function isTransientVoiceTransportError(error: VoiceSdkErrorLike) {
  return (
    (typeof error.code === "number" && TRANSIENT_TRANSPORT_ERROR_CODES.has(error.code)) ||
    /no transport available|transport error|websocket|signaling (?:socket|connection)/i.test(
      error.message ?? ""
    )
  );
}
