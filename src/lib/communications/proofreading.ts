export type WritingIssue = { start: number; end: number; original: string; replacement: string; explanation: string; kind: "spelling" | "grammar" };

/** Resolve exact quoted text ourselves; never trust model-generated character offsets. */
export function resolveWritingIssues(text: string, raw: unknown): WritingIssue[] {
  if (!Array.isArray(raw)) return [];
  const protectedRanges = [...text.matchAll(/\{[^{}]*\}|https?:\/\/\S+|\b[^\s@]+@[^\s@]+\.[^\s@]+/g)]
    .map((m) => ({ start: m.index!, end: m.index! + m[0].length }));
  const issues: WritingIssue[] = [];
  for (const item of raw.slice(0,30)) {
    if (!item || typeof item !== "object") continue;
    const { original, replacement, explanation, kind, occurrence } = item;
    if (typeof original !== "string" || !original || typeof replacement !== "string" || replacement === original || typeof explanation !== "string" || !["spelling", "grammar"].includes(kind) || !Number.isInteger(occurrence) || occurrence < 0 || occurrence > 100) continue;
    let start = -1;
    for (let i = 0; i <= occurrence; i++) { start = text.indexOf(original, start + 1); if (start < 0) break; }
    if (start < 0) continue;
    const end = start + original.length;
    if ([...protectedRanges, ...issues].some((r) => start < r.end && end > r.start)) continue;
    issues.push({ start, end, original, replacement, explanation: explanation.slice(0,300), kind });
  }
  return issues.sort((a,b) => a.start-b.start);
}

export function applyWritingIssue(text: string, issue: WritingIssue): string {
  if (text.slice(issue.start, issue.end) !== issue.original) return text;
  return text.slice(0, issue.start) + issue.replacement + text.slice(issue.end);
}
