export function parseAddTagConfig(config: unknown): string[] {
  const rec =
    config && typeof config === "object" && !Array.isArray(config)
      ? (config as Record<string, unknown>)
      : {};
  const fromList = Array.isArray(rec.tags)
    ? rec.tags.map((tag) => String(tag).trim()).filter(Boolean)
    : [];
  const single = typeof rec.tag === "string" ? rec.tag.trim() : "";
  const merged = [...fromList, ...(single ? [single] : [])];
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const tag of merged) {
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(tag);
  }
  return unique;
}

export function addTagSummary(config: unknown): string {
  const tags = parseAddTagConfig(config);
  return tags.length ? `Add tag · ${tags.join(", ")}` : "Add tag";
}

export function mergeCustomerTags(existing: string[], toAdd: string[]): string[] {
  const next = [...existing];
  const seen = new Set(existing.map((tag) => tag.toLowerCase()));
  for (const tag of toAdd) {
    const key = tag.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    next.push(tag);
  }
  return next;
}
