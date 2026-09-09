/** Prepend `Company Name: ` to outbound SMS when it is not already identified. */

export function prefixOutboundSmsWithCompanyName(companyName: string, body: string): string {
  const name = companyName.trim();
  const text = body ?? "";
  if (!name || !text.trim()) return text;

  const trimmedStart = text.trimStart();
  if (trimmedStart.toLowerCase().startsWith(name.toLowerCase())) {
    return text;
  }

  return `${name}: ${trimmedStart}`;
}
