import { NextRequest, NextResponse } from "next/server";
import {
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { createCompanyWithAdmin } from "@/lib/company/create-company";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN") return forbiddenResponse();

    const companies = await prisma.company.findMany({
      select: {
        id: true,
        name: true,
        bookingSlug: true,
        supportEmail: true,
        createdAt: true,
        _count: { select: { users: true } },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      companies: companies.map((c) => ({
        id: c.id,
        name: c.name,
        bookingSlug: c.bookingSlug,
        supportEmail: c.supportEmail,
        createdAt: c.createdAt,
        userCount: c._count.users,
        isCurrent: c.id === user.companyId,
      })),
    });
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN") return forbiddenResponse();

    const body = await request.json();
    const linkToMyAccount = body.linkToMyAccount !== false;

    const created = await createCompanyWithAdmin({
      name: String(body.name ?? ""),
      legalName: body.legalName ? String(body.legalName) : null,
      industry: body.industry ? String(body.industry) : null,
      address: body.address ? String(body.address) : null,
      city: body.city ? String(body.city) : null,
      state: body.state ? String(body.state) : null,
      zip: body.zip ? String(body.zip) : null,
      phone: body.phone ? String(body.phone) : null,
      supportEmail: body.supportEmail ? String(body.supportEmail) : null,
      website: body.website ? String(body.website) : null,
      timezone: body.timezone ? String(body.timezone) : null,
      bookingSlug: body.bookingSlug ? String(body.bookingSlug) : null,
      admin: {
        email: String(body.adminEmail ?? ""),
        name: String(body.adminName ?? "Admin"),
        firstName: body.adminFirstName ? String(body.adminFirstName) : null,
        lastName: body.adminLastName ? String(body.adminLastName) : null,
        phone: String(body.adminPhone ?? ""),
        password: String(body.adminPassword ?? ""),
      },
      linkToCreatorUserId: linkToMyAccount ? user.id : null,
    });

    return NextResponse.json(
      {
        company: created.company,
        admin: {
          id: created.admin.id,
          email: created.admin.email,
          name: created.admin.name,
          role: created.admin.role,
        },
        linked: linkToMyAccount,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message =
      error instanceof Error ? error.message : "Failed to create company";
    // Prisma unique violations surface as opaque messages
    if (
      typeof error === "object" &&
      error &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      return NextResponse.json(
        {
          error:
            "That admin email already exists on another company with a conflicting unique field, or booking slug conflict. Try a different email.",
        },
        { status: 400 }
      );
    }
    const status =
      message.includes("required") ||
      message.includes("invalid") ||
      message.includes("Password") ||
      message.includes("email")
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
