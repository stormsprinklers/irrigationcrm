import { z } from "zod";

/**
 * Normalize optional email for website lead ingest.
 * Blank / placeholder values become null. Invalid addresses also become null
 * so a bad email does not reject the entire lead (phone/name still land in CRM).
 */
export function normalizeOptionalLeadEmail(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower === "n/a" || lower === "na" || lower === "none" || lower === "null") {
    return null;
  }
  // Basic shape check — invalid emails are dropped rather than failing the lead.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  return trimmed;
}

const optionalLeadEmail = z.preprocess(
  normalizeOptionalLeadEmail,
  z.string().email().nullable().optional()
);

export const websiteLeadSchema = z.object({
  externalId: z.string().min(1),
  name: z.string().min(1),
  phone: z.string().optional().nullable(),
  email: optionalLeadEmail,
  source: z.string().optional().nullable(),
  status: z.enum(["NEW", "CONTACTED", "QUALIFIED", "LOST", "WON"]).optional(),
  notes: z.string().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
});

export const websiteCareersApplicationSchema = z.object({
  externalId: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional().nullable(),
  jobSlug: z.string().min(1),
  jobTitle: z.string().optional().nullable(),
  interest: z.string().optional().nullable(),
  hardWorkMeaning: z.string().min(1),
  integrityMeaning: z.string().min(1),
  inconvenientServiceExample: z.string().min(1),
  personalGoals: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type WebsiteCareersApplicationInput = z.infer<typeof websiteCareersApplicationSchema>;

export const websiteEventSchema = z.object({
  externalId: z.string().min(1),
  eventType: z.string().min(1),
  sessionId: z.string().optional().nullable(),
  pagePath: z.string().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  occurredAt: z.string().datetime().optional(),
});

export const designEstimateLineItemSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  quantity: z.number().positive(),
  unit: z.string().optional(),
  unitPrice: z.number().nonnegative(),
});

export const designEstimateAttachmentSchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  base64: z.string().min(1),
});

export const designEstimateSchema = z.object({
  externalId: z.string().min(1),
  customerId: z.string().min(1),
  propertyId: z.string().optional().nullable(),
  designProjectId: z.string().optional().nullable(),
  designVersionId: z.string().optional().nullable(),
  status: z.enum(["DRAFT", "SENT"]).optional(),
  notes: z.string().optional().nullable(),
  lineItems: z.array(designEstimateLineItemSchema).min(1),
  designExportMetadata: z.record(z.string(), z.unknown()).optional(),
  quoteTier: z.enum(["STANDARD", "PREMIUM"]).optional(),
  estimatedManHours: z.number().optional(),
  installDurationDays: z.number().int().positive().optional(),
  designInternalBom: z.array(z.record(z.string(), z.unknown())).optional(),
  premiumOptionTotal: z.number().optional(),
  premiumOption: z
    .object({
      sellTotal: z.number(),
      lineItems: z.array(designEstimateLineItemSchema),
    })
    .optional(),
  attachments: z.array(designEstimateAttachmentSchema).optional(),
});

export type WebsiteLeadInput = z.infer<typeof websiteLeadSchema>;
export type WebsiteEventInput = z.infer<typeof websiteEventSchema>;
export type DesignEstimateInput = z.infer<typeof designEstimateSchema>;
