import { EmployeeStatus } from "@prisma/client";
import { listOperatedVoiceAccounts } from "@/lib/account/operated-accounts";
import { resolveCreateEmployeePay } from "@/lib/compensation/defaults";
import { REVIEW_ALIAS_ROLES, generateReviewNameAliases } from "@/lib/google-business/review-aliases";
import { pushEmployeeToLms } from "@/lib/integrations/lms-sync";
import { prisma } from "@/lib/prisma";

export type SourceCompanyOption = { id: string; name: string };

export type SourceEmployeeMatch = "available" | "exists" | "linked";

export type SourceEmployeeRow = {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  title: string | null;
  status: EmployeeStatus;
  phone: string | null;
  match: SourceEmployeeMatch;
};

function importedFromTag(sourceUserId: string) {
  return `imported-from:${sourceUserId}`;
}

export async function listEmployeeSyncSourceCompanies(input: {
  userId: string;
  email: string;
  companyId: string;
}): Promise<{ currentCompany: SourceCompanyOption; companies: SourceCompanyOption[] }> {
  const current = await prisma.company.findUnique({
    where: { id: input.companyId },
    select: { id: true, name: true },
  });
  const accounts = await listOperatedVoiceAccounts(input);
  const byCompany = new Map<string, string>();
  for (const account of accounts) {
    if (account.companyId === input.companyId) continue;
    if (!byCompany.has(account.companyId)) {
      byCompany.set(account.companyId, account.companyName);
    }
  }
  const companies = [...byCompany.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    currentCompany: current ?? { id: input.companyId, name: "Current company" },
    companies,
  };
}

export async function assertOperatedSourceCompany(
  input: { userId: string; email: string; companyId: string },
  sourceCompanyId: string
) {
  if (!sourceCompanyId || sourceCompanyId === input.companyId) {
    throw new Error("Pick a different company to copy from");
  }
  const { companies } = await listEmployeeSyncSourceCompanies(input);
  if (!companies.some((company) => company.id === sourceCompanyId)) {
    throw new Error("You can only copy employees from a company you can switch into");
  }
}

async function ensureBidirectionalAccountLink(userIdA: string, userIdB: string) {
  if (userIdA === userIdB) return;
  await prisma.$transaction([
    prisma.userAccountLink.upsert({
      where: { userId_linkedUserId: { userId: userIdA, linkedUserId: userIdB } },
      update: {},
      create: { userId: userIdA, linkedUserId: userIdB },
    }),
    prisma.userAccountLink.upsert({
      where: { userId_linkedUserId: { userId: userIdB, linkedUserId: userIdA } },
      update: {},
      create: { userId: userIdB, linkedUserId: userIdA },
    }),
  ]);
}

export async function listSourceEmployeesForSync(
  sourceCompanyId: string,
  targetCompanyId: string
): Promise<SourceEmployeeRow[]> {
  const [source, target] = await Promise.all([
    prisma.user.findMany({
      where: {
        companyId: sourceCompanyId,
        systemKind: null,
        appleDemoAccount: false,
      },
      select: {
        id: true,
        name: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        title: true,
        status: true,
        phone: true,
      },
      orderBy: [{ status: "asc" }, { firstName: "asc" }, { lastName: "asc" }],
    }),
    prisma.user.findMany({
      where: { companyId: targetCompanyId, systemKind: null },
      select: { id: true, email: true, tags: true },
    }),
  ]);

  const targetByEmail = new Map(target.map((user) => [user.email.toLowerCase(), user.id]));
  const importedSourceIds = new Set(
    target.flatMap((user) =>
      user.tags
        .filter((tag) => tag.startsWith("imported-from:"))
        .map((tag) => tag.slice("imported-from:".length))
    )
  );
  const targetIds = target.map((user) => user.id);
  const sourceIds = source.map((user) => user.id);

  const links =
    sourceIds.length && targetIds.length
      ? await prisma.userAccountLink.findMany({
          where: { userId: { in: sourceIds }, linkedUserId: { in: targetIds } },
          select: { userId: true },
        })
      : [];
  const linkedSourceIds = new Set(links.map((link) => link.userId));

  return source.map((user) => {
    let match: SourceEmployeeMatch = "available";
    if (linkedSourceIds.has(user.id) || importedSourceIds.has(user.id)) {
      match = "linked";
    } else if (targetByEmail.has(user.email.toLowerCase())) {
      match = "exists";
    }
    return { ...user, match };
  });
}

export async function syncEmployeesFromCompany(params: {
  sourceCompanyId: string;
  targetCompanyId: string;
  employeeIds: string[];
}) {
  const uniqueIds = [...new Set(params.employeeIds.filter(Boolean))];
  const source = await prisma.user.findMany({
    where: {
      companyId: params.sourceCompanyId,
      id: { in: uniqueIds },
      systemKind: null,
      appleDemoAccount: false,
    },
  });

  const company = await prisma.company.findUniqueOrThrow({
    where: { id: params.targetCompanyId },
    select: {
      defaultTechnicianPayType: true,
      defaultTechnicianHourlyRate: true,
      defaultTechnicianCommissionPercent: true,
      overtimeWeeklyThresholdHours: true,
      overtimeRateMultiplier: true,
    },
  });

  const created: { sourceId: string; email: string; name: string }[] = [];
  const linked: { sourceId: string; email: string; name: string }[] = [];
  const skipped: { sourceId: string; reason: string }[] = [];

  const foundIds = new Set(source.map((user) => user.id));
  for (const id of uniqueIds) {
    if (!foundIds.has(id)) {
      skipped.push({ sourceId: id, reason: "Employee not found on the source company" });
    }
  }

  for (const user of source) {
    const email = user.email.toLowerCase();
    const existing = await prisma.user.findFirst({
      where: { companyId: params.targetCompanyId, email },
    });

    if (existing) {
      await ensureBidirectionalAccountLink(user.id, existing.id);
      linked.push({ sourceId: user.id, email, name: user.name });
      continue;
    }

    const alreadyImported = await prisma.user.findFirst({
      where: {
        companyId: params.targetCompanyId,
        tags: { has: importedFromTag(user.id) },
      },
      select: { id: true },
    });
    if (alreadyImported) {
      await ensureBidirectionalAccountLink(user.id, alreadyImported.id);
      linked.push({ sourceId: user.id, email, name: user.name });
      continue;
    }

    const pay = resolveCreateEmployeePay(user.role, {}, company);
    const createdUser = await prisma.user.create({
      data: {
        companyId: params.targetCompanyId,
        firstName: user.firstName,
        lastName: user.lastName,
        name: user.name,
        email,
        phone: user.phone,
        role: user.role,
        title: user.title,
        status: user.status,
        division: user.division,
        color: user.color,
        photoUrl: user.photoUrl,
        address: user.address,
        city: user.city,
        state: user.state,
        zip: user.zip,
        birthDate: user.birthDate,
        passwordHash: user.passwordHash,
        payType: pay.payType,
        hourlyRate: pay.hourlyRate,
        commissionPercent: pay.commissionPercent,
        tags: [...user.tags.filter((tag) => !tag.startsWith("imported-from:")), importedFromTag(user.id)],
      },
    });

    await ensureBidirectionalAccountLink(user.id, createdUser.id);

    if (REVIEW_ALIAS_ROLES.includes(createdUser.role) && createdUser.firstName) {
      const aliases = await generateReviewNameAliases({
        companyId: params.targetCompanyId,
        userId: createdUser.id,
        firstName: createdUser.firstName,
      });
      if (aliases.length) {
        await prisma.user.update({
          where: { id: createdUser.id },
          data: { reviewNameAliases: aliases },
        });
      }
    }

    void pushEmployeeToLms(createdUser).catch(() => {});
    created.push({ sourceId: user.id, email, name: user.name });
  }

  return { created, linked, skipped };
}
