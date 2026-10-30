import { IntegrationType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import {
  createAffiliateCustomer,
  parseAffiliateCustomerPayload,
} from "@/lib/affiliate/customers";
import { authenticateIntegration, isIntegrationContext } from "@/lib/integrations/auth";
import { logIntegrationAudit } from "@/lib/integrations/audit";

export async function POST(request: NextRequest) {
  const auth = await authenticateIntegration(request, IntegrationType.AFFILIATE);
  if (!isIntegrationContext(auth)) return auth;
  if (!auth.ownerUserId) {
    return NextResponse.json({ error: "Affiliate key is not assigned" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = parseAffiliateCustomerPayload(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  if (parsed.data.dryRun) {
    await logIntegrationAudit({
      companyId: auth.companyId,
      integrationType: IntegrationType.AFFILIATE,
      action: "affiliate.customers.test",
      payload: { credentialId: auth.credentialId },
      status: "success",
    });
    return NextResponse.json({ ok: true, dryRun: true, message: "Connection and field mapping are valid" });
  }

  try {
    const customer = await createAffiliateCustomer({
      companyId: auth.companyId,
      affiliateUserId: auth.ownerUserId,
      input: parsed.data,
    });
    await logIntegrationAudit({
      companyId: auth.companyId,
      integrationType: IntegrationType.AFFILIATE,
      action: "affiliate.customers.create",
      payload: { credentialId: auth.credentialId, customerId: customer.id },
      status: "success",
    });
    return NextResponse.json(
      { ok: true, customer_id: customer.id, customer_name: customer.name },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not import customer";
    await logIntegrationAudit({
      companyId: auth.companyId,
      integrationType: IntegrationType.AFFILIATE,
      action: "affiliate.customers.create",
      payload: { credentialId: auth.credentialId },
      status: "error",
      error: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
