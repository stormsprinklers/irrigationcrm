/** Overlapping response.create while the model is already speaking. */
export function isRecoverableRealtimeError(message: string, code?: string | null) {
  const text = message || "";
  const normalizedCode = String(code || "");
  return (
    /session\.type|session\.update/i.test(text) ||
    /conversation_already_has_active_response/i.test(normalizedCode) ||
    /already has an active response/i.test(text)
  );
}
