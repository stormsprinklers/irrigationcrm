import { NextRequest, NextResponse } from "next/server";
import { forbiddenForFieldRole, badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { countCustomers, listCustomers, serializeCustomer } from "@/lib/customers/queries";
import { parseCustomerRecordSegment } from "@/lib/customers/lifetime-value";
import { normalizePhone } from "@/lib/inbox/phone";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const { searchParams } = request.nextUrl;
    const filters = {
      search: searchParams.get("search") ?? undefined,
      city: searchParams.get("city") ?? undefined,
      zip: searchParams.get("zip") ?? undefined,
      leadSource: searchParams.get("leadSource") ?? undefined,
      company: searchParams.get("company") ?? undefined,
      status: (searchParams.get("status") as "ACTIVE" | "ARCHIVED" | "ALL" | null) ?? undefined,
      segment: parseCustomerRecordSegment(searchParams.get("segment")),
    };
    const page = Math.max(1, Math.min(100_000, Math.floor(Number(searchParams.get("page")) || 1)));
    const pageSize = Math.max(10, Math.min(100, Math.floor(Number(searchParams.get("pageSize")) || 25)));
    const requestedSort = searchParams.get("sortBy");
    const sortBy = requestedSort === "phone" || requestedSort === "email" ? requestedSort : "name";
    const [customers, total] = await Promise.all([
      listCustomers(user.companyId, filters, { skip: (page - 1) * pageSize, take: pageSize, sortBy, sortDesc: searchParams.get("sortDesc") === "true" }),
      countCustomers(user.companyId, filters),
    ]);
    return NextResponse.json({ customers, total, page, pageSize });
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const fieldDenied = forbiddenForFieldRole(user.role); if (fieldDenied) return fieldDenied;

    const body = await request.json();
    if (!body.name?.trim()) return badRequestResponse("name is required");

    const customer = await prisma.customer.create({
      data: {
        companyId: user.companyId,
        name: String(body.name).trim(),
        phone: body.phone ? normalizePhone(String(body.phone)) : null,
        email: body.email ?? null,
        companyName: body.companyName ?? null,
        address: body.address ?? null,
        city: body.city ?? null,
        state: body.state ?? null,
        zip: body.zip ?? null,
        leadSource: body.leadSource ?? null,
      },
      include: {
        _count: { select: { properties: true, visits: true, estimates: true, invoices: true } },
      },
    });

    const { autoEnrollCustomerIfEnabled } = await import("@/lib/referrals/members");
    void autoEnrollCustomerIfEnabled(user.companyId, customer.id).catch(() => {});

    return NextResponse.json(serializeCustomer(customer), { status: 201 });
  } catch {
    return unauthorizedResponse();
  }
}
