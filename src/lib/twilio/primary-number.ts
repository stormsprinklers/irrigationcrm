import { PhoneNumberType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Ensure only one primary phone number per company.
 * Clears isPrimary on others and demotes other PRIMARY types to TRACKING.
 */
export async function setExclusivePrimaryNumber(params: {
  companyId: string;
  numberId: string;
}) {
  await prisma.$transaction([
    prisma.phoneNumber.updateMany({
      where: {
        companyId: params.companyId,
        NOT: { id: params.numberId },
        OR: [{ isPrimary: true }, { numberType: PhoneNumberType.PRIMARY }],
      },
      data: {
        isPrimary: false,
        numberType: PhoneNumberType.TRACKING,
      },
    }),
    prisma.phoneNumber.update({
      where: { id: params.numberId, companyId: params.companyId },
      data: {
        isPrimary: true,
        numberType: PhoneNumberType.PRIMARY,
      },
    }),
  ]);
}
