/**
 * Keep realtime voice tool payloads small and structured.
 * sanitizeToolPayload() previously replaced oversized JSON with `{ truncated: true }`,
 * which made successful searches look like failures and stripped the data the model needs.
 */

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toolDataRoot(result: unknown): Record<string, unknown> | null {
  const root = asRecord(result);
  if (!root) return null;
  return asRecord(root.data) ?? root;
}

function asVisualMatch(value: unknown) {
  return asRecord(value);
}

export function slimSearchNote(
  visualMatch: Record<string, unknown> | null,
  hasChatCard: boolean
) {
  if (visualMatch?.confirmed === true) {
    return hasChatCard
      ? "Visual compare confirmed the top part. Speak that match now. The matching library photo is already shown in the chat panel."
      : "Visual compare confirmed the top part. Speak that match now. No chat card was attached — describe the part briefly and do not invent a link.";
  }
  if (visualMatch?.ran === true) {
    return "Visual compare did not confirm a library part. Say you could not confirm from the photo. Do not invent a link.";
  }
  return hasChatCard
    ? "Speak the best match now in a few short sentences. Photos are already shown in the chat panel. Do not read visualDescription or the full technical write-up. Do not invent a link."
    : "Speak the best match now in a few short sentences. No chat card was attached — identify the part briefly without inventing a link or saying a card is on screen.";
}

/** Ultra-compact parts rows for the realtime model (card carries photos separately). */
export function slimRealtimeToolResult(
  name: string,
  result: unknown,
  hasChatCard = false
): unknown {
  const root = asRecord(result);
  if (!root) return result;
  const data = toolDataRoot(result);
  if (!data) return result;

  if (name === "search_parts_info" && Array.isArray(data.parts)) {
    const slimParts = data.parts.slice(0, 5).map((row) => {
      if (!row || typeof row !== "object") return row;
      const part = row as Record<string, unknown>;
      return {
        id: part.id,
        name: part.name,
        manufacturer: part.manufacturer ?? null,
        partNumber: part.partNumber ?? null,
        section: part.section ?? null,
        hasManual: part.hasManual ?? Boolean(part.manualUrl),
        manualUrl: part.manualUrl ?? null,
        manualKind: part.manualKind ?? null,
        photoCount: Array.isArray(part.photos)
          ? part.photos.length
          : (part.photoCount ?? 0),
        matchedPhotoId: part.matchedPhotoId ?? null,
        visualConfidence: part.visualConfidence ?? null,
      };
    });
    const visualMatch = asVisualMatch(data.visualMatch);
    const note = slimSearchNote(visualMatch, hasChatCard);
    const body = {
      query: data.query ?? null,
      count: slimParts.length,
      parts: slimParts,
      visualMatch,
      note,
    };
    if (asRecord(root.data)) {
      return { ok: root.ok !== false, data: body };
    }
    return { ok: root.ok !== false, ...body };
  }

  if (name === "get_parts_info") {
    const part = asRecord(data.part);
    if (part) {
      const slimPart = {
        id: part.id,
        name: part.name,
        manufacturer: part.manufacturer ?? null,
        partNumber: part.partNumber ?? null,
        sectionName: part.sectionName ?? part.section ?? null,
        hasManual: Boolean(part.manualUrl),
        manualUrl: part.manualUrl ?? null,
        manualKind: part.manualKind ?? null,
        manualFileName: part.manualFileName ?? null,
      };
      const note = hasChatCard
        ? "Speak a few short sentences about this part. Photos are already shown in the chat panel. Do not invent a link."
        : "Speak a few short sentences about this part. No chat card was attached — do not invent a link or say a card is on screen.";
      if (asRecord(root.data)) {
        return { ok: root.ok !== false, data: { part: slimPart, note } };
      }
      return { ok: root.ok !== false, part: slimPart, note };
    }
  }

  // Preserve ok for other tools; prefer original structured result.
  if (root.ok === false) return root;
  return { ok: true, ...root };
}

/** Prefer a structured slim payload; never return a bare `{ truncated }` stub to the voice client. */
export function finalizeRealtimeToolPayload(
  name: string,
  result: unknown,
  chatCard: unknown,
  sanitize: (value: unknown, max?: number) => unknown,
  max = 3500
): Record<string, unknown> {
  const hasChatCard = Boolean(chatCard);
  const slimmed = slimRealtimeToolResult(name, result, hasChatCard);
  const sanitized = sanitize(slimmed, max);
  const root = asRecord(result);
  const ok = root?.ok !== false;

  let payload: Record<string, unknown>;
  if (
    asRecord(sanitized) &&
    !("truncated" in (sanitized as object))
  ) {
    payload = { ...(sanitized as Record<string, unknown>) };
  } else {
    // sanitize gave up — keep an even smaller structured body for the model/client.
    const fallback = slimRealtimeToolResult(name, result, hasChatCard);
    payload = asRecord(fallback) ?? { ok, error: "Tool result too large" };
  }

  if (!("ok" in payload)) payload.ok = ok;
  if (chatCard) payload.chatCard = chatCard;
  return payload;
}

/** True when a realtime tool HTTP body represents success for UI logging. */
export function isRealtimeToolResultOk(result: unknown): boolean {
  const root = asRecord(result);
  if (!root) return false;
  if (root.ok === false) return false;
  if (root.truncated === true && !("data" in root) && !("parts" in root) && !("part" in root)) {
    return false;
  }
  return true;
}
