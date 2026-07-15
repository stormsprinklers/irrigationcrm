import type { Lead, Prisma } from "@prisma/client";
import type { WebsiteLeadInput } from "@/lib/integrations/schemas";

/** True when the stored lead has almost no usable contact/context fields. */
export function isSparseLead(lead: Pick<Lead, "phone" | "email" | "notes">): boolean {
  return !lead.phone?.trim() && !lead.email?.trim() && !lead.notes?.trim();
}

function asMetadataRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

/**
 * Build a Prisma update that only fills empty lead columns from a later website
 * push for the same externalId. Never overwrites non-empty stored values.
 */
export function buildSparseLeadFillPatch(
  existing: Pick<Lead, "name" | "phone" | "email" | "notes" | "source" | "metadata">,
  input: WebsiteLeadInput,
  notesFromInput: string | null,
  metadataFromInput: Record<string, unknown>
): Prisma.LeadUpdateInput {
  const patch: Prisma.LeadUpdateInput = {};

  if (!existing.phone?.trim() && input.phone?.trim()) {
    patch.phone = input.phone.trim();
  }
  if (!existing.email?.trim() && input.email?.trim()) {
    patch.email = input.email.trim();
  }
  if (!existing.notes?.trim() && notesFromInput?.trim()) {
    patch.notes = notesFromInput;
  }
  if (
    existing.name.trim().toLowerCase() === "unknown" &&
    input.name.trim() &&
    input.name.trim().toLowerCase() !== "unknown"
  ) {
    patch.name = input.name.trim();
  }
  if (!existing.source?.trim() && input.source?.trim()) {
    patch.source = input.source.trim();
  }

  const existingMeta = asMetadataRecord(existing.metadata);
  const mergedMeta = { ...metadataFromInput, ...existingMeta };
  // Prefer newly provided metadata keys when the stored value is empty/missing.
  for (const [key, value] of Object.entries(metadataFromInput)) {
    const prev = existingMeta[key];
    if (prev === undefined || prev === null || prev === "") {
      mergedMeta[key] = value;
    }
  }
  if (JSON.stringify(mergedMeta) !== JSON.stringify(existingMeta)) {
    patch.metadata = mergedMeta as Prisma.InputJsonValue;
  }

  return patch;
}
