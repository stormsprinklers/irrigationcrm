import { prisma } from "@/lib/prisma";

export const DO_NOT_SERVICE_MESSAGE =
  "This customer is marked DO NOT SERVICE and cannot be scheduled for appointments.";

export async function getCustomerServiceBlock(companyId: string, customerId: string | null | undefined) {
  if (!customerId) return null;

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, companyId },
    select: { doNotService: true, name: true },
  });

  if (!customer?.doNotService) return null;
  return DO_NOT_SERVICE_MESSAGE;
}
