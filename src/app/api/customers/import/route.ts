import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionUser, unauthorizedResponse, forbiddenResponse } from "@/lib/api-auth";
import { canManageCustomers } from "@/lib/customers/permissions";
import { importCustomerRow } from "@/lib/customers/import-customers";

export const maxDuration = 60;

const optionalText = z.string().max(500).nullish();
const rowSchema = z.object({
  name: z.string().max(200), address: optionalText, city: optionalText, state: optionalText, zip: optionalText,
  phone: optionalText, phones: z.array(z.string().max(100)).max(20).optional(),
  email: optionalText, emails: z.array(z.string().max(300)).max(20).optional(),
  companyName: optionalText, tags: z.array(z.string().max(100)).max(30).optional(),
  marketingEmailOptOut: z.boolean().optional(), marketingSmsOptOut: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    if (!canManageCustomers(user.role)) return forbiddenResponse();
    const body = await request.json();
    const parsed = z.object({ rows: z.array(rowSchema).min(1).max(25) }).safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Import up to 25 valid CSV rows per batch" }, { status: 400 });
    const results = [];
    for (const row of parsed.data.rows) {
      try {
        results.push({ ...(await importCustomerRow(user.companyId, row)), name: row.name });
      } catch (error) {
        console.error("Customer CSV import row failed", error);
        results.push({ action: "skipped", name: row.name, reason: "Could not save this row" });
      }
    }
    return NextResponse.json({ results });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return unauthorizedResponse();
    return NextResponse.json({ error: "Customer import failed" }, { status: 500 });
  }
}
