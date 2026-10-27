import { z } from "zod";

export const websiteLeadSchema = z
  .object({
    externalId: z.string().min(1),
    name: z.string().min(1),
    phone: z.string().optional().nullable(),
    email: z.string().email().optional().nullable().or(z.literal("")),
    source: z.string().optional().nullable(),
    status: z.enum(["NEW", "CONTACTED", "QUALIFIED", "LOST", "WON"]).optional(),
    notes: z.string().optional().nullable(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    address: z.string().optional().nullable(),
    city: z.string().optional().nullable(),
  })
  // Meta/GHL forms may contain arbitrary custom-question keys. Preserve them
  // so the intake layer can store every answer instead of silently stripping it.
  .passthrough();

const WEBSITE_LEAD_CORE_KEYS = new Set([
  "externalId",
  "name",
  "phone",
  "email",
  "source",
  "status",
  "notes",
  "metadata",
  "address",
  "city",
]);

const WEBSITE_LEAD_METADATA_KEYS = new Set([
  "facebook_lead_id",
  "facebookLeadId",
  "meta_lead_id",
  "leadgen_id",
  "leadconnector_contact_id",
  "meta_page_id",
  "meta_form_id",
  "meta_campaign_id",
  "meta_adset_id",
  "meta_ad_id",
  "gclid",
  "gbraid",
  "wbraid",
  "fbclid",
  "fbc",
  "fbp",
  "user_agent",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
]);

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Move arbitrary integration fields into a stable metadata container. */
export function captureWebsiteLeadFormFields(
  input: WebsiteLeadInput
): WebsiteLeadInput {
  const extras = Object.fromEntries(
    Object.entries(input).filter(
      ([key, value]) => !WEBSITE_LEAD_CORE_KEYS.has(key) && value !== undefined && value !== null
    )
  );
  if (!Object.keys(extras).length) return input;

  const metadata = recordValue(input.metadata) ?? {};
  const existingFields =
    recordValue(metadata.form_fields) ?? recordValue(metadata.formFields) ?? {};
  const metadataFields = Object.fromEntries(
    Object.entries(extras).filter(([key]) => WEBSITE_LEAD_METADATA_KEYS.has(key))
  );
  const formFields = Object.fromEntries(
    Object.entries(extras).filter(([key]) => !WEBSITE_LEAD_METADATA_KEYS.has(key))
  );
  return {
    ...input,
    metadata: {
      ...metadata,
      ...metadataFields,
      ...(Object.keys(formFields).length
        ? { form_fields: { ...existingFields, ...formFields } }
        : {}),
    },
  };
}

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

export const websiteWinterizationSchema = z.object({
  externalId: z.string().min(1),
  name: z.string().min(1),
  firstName: z.string().optional().nullable(),
  lastName: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  zip: z.string().optional().nullable(),
  zoneCount: z.number().int().positive(),
  quotedPrice: z.number().nonnegative(),
  weekStart: z.string().min(8),
  weekEnd: z.string().min(8),
  weekLabel: z.string().min(1),
  schedulingNotes: z.string().optional().nullable(),
  shutoffValveLocation: z.string().optional().nullable(),
  timerLocation: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
});

export type WebsiteWinterizationInput = z.infer<typeof websiteWinterizationSchema>;

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
