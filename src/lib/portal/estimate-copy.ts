/** Remove legacy staff notes that older holiday quotes embedded in public copy. */
export function customerEstimateDescription(description: string | null | undefined, internalNotes: unknown[]) {
  if (!description) return null;
  let text = description;
  for (const note of internalNotes) {
    if (typeof note === "string" && note.trim()) text = text.split(note.trim()).join("");
  }
  return text.replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, "\n\n").trim() || null;
}
