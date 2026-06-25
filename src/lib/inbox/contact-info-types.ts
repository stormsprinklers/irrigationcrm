export type ParsedSmsContactInfo = {
  firstName: string | null;
  lastName: string | null;
  homeAddress: string | null;
  email: string | null;
  phone: string | null;
};

export function emptyParsedContactInfo(): ParsedSmsContactInfo {
  return {
    firstName: null,
    lastName: null,
    homeAddress: null,
    email: null,
    phone: null,
  };
}

export function isParsedSmsContactInfo(value: unknown): value is ParsedSmsContactInfo {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    (record.firstName === null || typeof record.firstName === "string") &&
    (record.lastName === null || typeof record.lastName === "string") &&
    (record.homeAddress === null || typeof record.homeAddress === "string") &&
    (record.email === null || typeof record.email === "string") &&
    (record.phone === null || typeof record.phone === "string")
  );
}

export function withDefaultPhone(
  parsed: ParsedSmsContactInfo,
  fallbackPhone: string | null | undefined
): ParsedSmsContactInfo {
  if (parsed.phone?.trim()) return parsed;
  if (!fallbackPhone?.trim()) return parsed;
  return { ...parsed, phone: fallbackPhone.trim() };
}

export function formatContactName(parsed: ParsedSmsContactInfo) {
  return [parsed.firstName, parsed.lastName].filter(Boolean).join(" ").trim();
}
