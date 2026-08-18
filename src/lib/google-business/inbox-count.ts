import { GbpReviewAssignStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Reviews that still need a reply or technician assignment. */
export async function countGbpInboxAttention(companyId: string) {
  return prisma.gbpReview.count({
    where: {
      companyId,
      OR: [{ hasReply: false }, { status: GbpReviewAssignStatus.NEEDS_REVIEW }],
    },
  });
}
