import { NextRequest, NextResponse } from "next/server";
import { Prisma, UserRole } from "@prisma/client";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

const ROLE_OPTIONS = ["ADMIN", "MANAGER", "CSR", "TECH"] as const;

async function getDistinctCustomerTags(companyId: string) {
  const rows = await prisma.customer.findMany({
    where: { companyId, status: "ACTIVE" },
    select: { tags: true },
  });
  return [...new Set(rows.flatMap((row) => row.tags))].sort((a, b) => a.localeCompare(b));
}

async function getDistinctEmployeeTags(companyId: string) {
  const rows = await prisma.user.findMany({
    where: { companyId, status: "ACTIVE" },
    select: { tags: true },
  });
  return [...new Set(rows.flatMap((row) => row.tags))].sort((a, b) => a.localeCompare(b));
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const scope = request.nextUrl.searchParams.get("scope") ?? "external";
    const search = request.nextUrl.searchParams.get("search")?.trim();
    const tag = request.nextUrl.searchParams.get("tag")?.trim();
    const role = request.nextUrl.searchParams.get("role")?.trim();

    if (scope === "internal") {
      const where: Prisma.UserWhereInput = {
        companyId: user.companyId,
        status: "ACTIVE",
        email: { not: "" },
      };

      if (search) {
        where.OR = [
          { name: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
        ];
      }
      if (tag) where.tags = { has: tag };
      if (role && ROLE_OPTIONS.includes(role as (typeof ROLE_OPTIONS)[number])) {
        where.role = role as UserRole;
      }

      const [employees, availableTags] = await Promise.all([
        prisma.user.findMany({
          where,
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            role: true,
            tags: true,
          },
          orderBy: { name: "asc" },
          take: 50,
        }),
        getDistinctEmployeeTags(user.companyId),
      ]);

      return NextResponse.json({
        employees,
        availableTags,
        availableRoles: ROLE_OPTIONS,
      });
    }

    const where: Prisma.CustomerWhereInput = {
      companyId: user.companyId,
      status: "ACTIVE",
      email: { not: null },
      NOT: { email: "" },
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }
    if (tag) where.tags = { has: tag };

    const [customers, availableTags] = await Promise.all([
      prisma.customer.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          tags: true,
        },
        orderBy: { name: "asc" },
        take: 50,
      }),
      getDistinctCustomerTags(user.companyId),
    ]);

    return NextResponse.json({ customers, availableTags });
  } catch {
    return unauthorizedResponse();
  }
}
