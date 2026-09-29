import { EmployeeStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * A push endpoint/device is unique to a browser or phone, so switching companies
 * moves that endpoint to the newly selected User record. Expand recipients to
 * every account belonging to the same employee so notifications from another
 * operated company still reach that endpoint.
 */
export async function expandPushRecipientUserIds(userIds: string[]): Promise<string[]> {
  const seedIds = [...new Set(userIds.filter(Boolean))];
  if (!seedIds.length) return [];

  const seeds = await prisma.user.findMany({
    where: { id: { in: seedIds } },
    select: { id: true, email: true },
  });
  const emails = [...new Set(seeds.map((user) => user.email.toLowerCase()))];

  const [sameEmailUsers, forwardLinks, reverseLinks] = await Promise.all([
    prisma.user.findMany({
      where: {
        email: { in: emails },
        status: EmployeeStatus.ACTIVE,
        systemKind: null,
      },
      select: { id: true },
    }),
    prisma.userAccountLink.findMany({
      where: { userId: { in: seedIds } },
      select: { linkedUserId: true },
    }),
    prisma.userAccountLink.findMany({
      where: { linkedUserId: { in: seedIds } },
      select: { userId: true },
    }),
  ]);

  return [
    ...new Set([
      ...seedIds,
      ...sameEmailUsers.map((user) => user.id),
      ...forwardLinks.map((link) => link.linkedUserId),
      ...reverseLinks.map((link) => link.userId),
    ]),
  ];
}
