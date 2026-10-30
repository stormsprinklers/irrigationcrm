import { z } from "zod";

const customerFields = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().min(1, "Last name is required").max(100),
  phone: z.string().trim().max(40).optional().default(""),
  email: z.string().trim().email("Email must be valid").max(320).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional().default(""),
  leadSource: z.string().trim().max(160).optional().default("Affiliate"),
  notes: z.string().trim().max(10_000).optional().default(""),
  dryRun: z.boolean().optional().default(false),
});

export type AffiliateCustomerInput = z.infer<typeof customerFields>;

function value(input: Record<string, unknown>, camel: string, snake: string) {
  return input[camel] ?? input[snake];
}

export function parseAffiliateCustomerPayload(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return customerFields.safeParse(input);
  }
  const body = input as Record<string, unknown>;
  return customerFields.safeParse({
    firstName: value(body, "firstName", "first_name"),
    lastName: value(body, "lastName", "last_name"),
    phone: body.phone,
    email: body.email,
    address: body.address,
    leadSource: value(body, "leadSource", "lead_source"),
    notes: body.notes,
    dryRun: value(body, "dryRun", "dry_run"),
  });
}
