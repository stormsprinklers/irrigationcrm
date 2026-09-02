import { EmployeeStatus } from "@prisma/client";
import { mixWithWhite, resolveBrandPalette } from "@/lib/brand-palette";
import { prisma } from "@/lib/prisma";

export type OperatedVoiceAccount = {
  userId: string;
  companyId: string;
  companyName: string;
  brandPrimary: string;
  brandSoft: string;
};

const companyBrandSelect = {
  id: true,
  name: true,
  brandPrimaryColor: true,
  brandSecondaryColor: true,
  brandPalette: true,
} as const;

function toAccount(
  userId: string,
  company: {
    id: string;
    name: string;
    brandPrimaryColor: string | null;
    brandSecondaryColor: string | null;
    brandPalette: unknown;
  }
): OperatedVoiceAccount {
  const palette = resolveBrandPalette(company);
  return {
    userId,
    companyId: company.id,
    companyName: company.name,
    brandPrimary: palette.primary,
    brandSoft: palette.soft || mixWithWhite(palette.primary, 0.85),
  };
}

/**
 * The signed-in user plus every switchable account (same email or UserAccountLink).
 * Used so a CSR registered on Company A still rings for Company B.
 */
export async function listOperatedVoiceAccounts(input: {
  userId: string;
  email: string;
  companyId: string;
}): Promise<OperatedVoiceAccount[]> {
  const byUserId = new Map<string, OperatedVoiceAccount>();

  const current = await prisma.user.findFirst({
    where: { id: input.userId, status: EmployeeStatus.ACTIVE },
    select: { id: true, company: { select: companyBrandSelect } },
  });
  if (current) {
    byUserId.set(current.id, toAccount(current.id, current.company));
  }

  const sameEmail = await prisma.user.findMany({
    where: {
      email: input.email.toLowerCase(),
      status: EmployeeStatus.ACTIVE,
      systemKind: null,
    },
    select: { id: true, company: { select: companyBrandSelect } },
  });
  for (const row of sameEmail) {
    if (!byUserId.has(row.id)) {
      byUserId.set(row.id, toAccount(row.id, row.company));
    }
  }

  const links = await prisma.userAccountLink.findMany({
    where: { userId: input.userId },
    include: {
      linkedUser: {
        select: {
          id: true,
          status: true,
          company: { select: companyBrandSelect },
        },
      },
    },
  });
  for (const link of links) {
    if (link.linkedUser.status !== EmployeeStatus.ACTIVE) continue;
    if (!byUserId.has(link.linkedUser.id)) {
      byUserId.set(link.linkedUser.id, toAccount(link.linkedUser.id, link.linkedUser.company));
    }
  }

  const reverseLinks = await prisma.userAccountLink.findMany({
    where: { linkedUserId: input.userId },
    include: {
      user: {
        select: {
          id: true,
          status: true,
          company: { select: companyBrandSelect },
        },
      },
    },
  });
  for (const link of reverseLinks) {
    if (link.user.status !== EmployeeStatus.ACTIVE) continue;
    if (!byUserId.has(link.user.id)) {
      byUserId.set(link.user.id, toAccount(link.user.id, link.user.company));
    }
  }

  const accounts = Array.from(byUserId.values());
  accounts.sort((a, b) => {
    if (a.companyId === input.companyId) return -1;
    if (b.companyId === input.companyId) return 1;
    return a.companyName.localeCompare(b.companyName);
  });
  return accounts;
}

export async function listOperatedCompanyIds(input: {
  userId: string;
  email: string;
  companyId: string;
}): Promise<string[]> {
  const accounts = await listOperatedVoiceAccounts(input);
  return [...new Set(accounts.map((a) => a.companyId))];
}
