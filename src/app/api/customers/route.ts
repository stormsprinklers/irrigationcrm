import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { listCustomers, serializeCustomer } from "@/lib/customers/queries";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const search = request.nextUrl.searchParams.get("search") ?? undefined;
    const customers = await listCustomers(user.companyId, search);
    return NextResponse.json({ customers, total: customers.length });
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (user.role === "TECH") return forbiddenResponse();

    const body = await request.json();
    if (!body.name?.trim()) return badRequestResponse("name is required");

    const customer = await prisma.customer.create({
      data: {
        companyId: user.companyId,
        name: String(body.name).trim(),
        phone: body.phone ?? null,
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

    return NextResponse.json(serializeCustomer(customer), { status: 201 });
  } catch {
    return unauthorizedResponse();
  }
}
