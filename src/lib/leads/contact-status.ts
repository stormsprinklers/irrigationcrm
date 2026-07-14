import { LeadStatus, Prisma } from "@prisma/client";

/** Digits used to match phone numbers across slightly different formats. */
export function leadPhoneKey(phone: string | null | undefined) {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length >= 10) return digits.slice(-10);
  return digits || null;
}

/**
 * Prisma update data when changing lead status.
 * Sets contactedAt the first time status becomes CONTACTED.
 */
export function leadStatusUpdateData(
  existing: { status: LeadStatus; contactedAt: Date | null },
  nextStatus: LeadStatus
): Prisma.LeadUpdateInput {
  const data: Prisma.LeadUpdateInput = { status: nextStatus };

  if (nextStatus === LeadStatus.CONTACTED && !existing.contactedAt) {
    data.contactedAt = new Date();
  }

  // Reopening a spam/new lead should not invent a contacted timestamp.
  if (nextStatus === LeadStatus.NEW && existing.status === LeadStatus.SPAM) {
    // leave contactedAt unchanged
  }

  return data;
}
