/** Convert model-authored Markdown into readable SMS-safe plain text. */
export function ownerAssistantSmsText(value: string, maxLength = 1500): string {
  const plain = value
    .replace(/\r\n?/g, "\n")
    .replace(/```(?:[a-z0-9_-]+)?\s*([\s\S]*?)```/gi, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/gi, "$1: $2")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi, "$1: $2")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/\\([*_`#])/g, "$1")
    .replace(/\*{3}([^*\n]+)\*{3}/g, "$1")
    .replace(/_{3}([^_\n]+)_{3}/g, "$1")
    .replace(/\*{2}([^*\n]+)\*{2}/g, "$1")
    .replace(/_{2}([^_\n]+)_{2}/g, "$1")
    .replace(/(^|\s)\*([^*\n]+)\*(?=\s|[.,!?;:]|$)/g, "$1$2")
    .replace(/(^|\s)_([^_\n]+)_(?=\s|[.,!?;:]|$)/g, "$1$2")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "- ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return plain.slice(0, maxLength).trim();
}
