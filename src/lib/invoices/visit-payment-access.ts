import { forbiddenResponse } from "@/lib/api-auth";
import type { FieldAccessUser } from "@/lib/field/access";
import { requireFieldVisitAccess } from "@/lib/field/visit-guard";
import { canTakeVisitPayments } from "@/lib/invoices/permissions";

/**
 * Office billing roles may act on any company visit. Field roles are limited
 * to visits assigned directly to them, additionally assigned to them, created
 * by them, or assigned to one of their crews.
 */
export async function visitPaymentAccessResponse(
  user: FieldAccessUser,
  visitId: string
) {
  if (!canTakeVisitPayments(user.role)) return forbiddenResponse();
  const access = await requireFieldVisitAccess(user, visitId);
  return access.ok ? null : access.response;
}
