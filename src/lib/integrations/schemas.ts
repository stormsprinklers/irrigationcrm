import { z } from "zod";

export const websiteLeadSchema = z.object({
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
});

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
});

export type WebsiteLeadInput = z.infer<typeof websiteLeadSchema>;
export type WebsiteEventInput = z.infer<typeof websiteEventSchema>;
export type DesignEstimateInput = z.infer<typeof designEstimateSchema>;
