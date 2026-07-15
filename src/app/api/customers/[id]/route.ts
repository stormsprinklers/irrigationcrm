import { NextRequest, NextResponse } from "next/server";
import { forbiddenForFieldRole, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canEditCustomerTags, canFlagDoNotService, canManageCustomers } from "@/lib/customers/permissions";
import { getCustomerForCompany, serializeCustomer } from "@/lib/customers/queries";
import { normalizePhone } from "@/lib/inbox/phone";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const customer = await getCustomerForCompany(user.companyId, id);
    if (!customer) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(serializeCustomer(customer));
  } catch {
    return unauthorizedResponse();
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const existing = await prisma.customer.findFirst({ where: { id, companyId: user.companyId } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();
    const bodyKeys = Object.keys(body).filter((key) => body[key] !== undefined);

    if (user.role === "TECH" || user.role === "INSTALLER") {
      if (!canEditCustomerTags(user.role)) return forbiddenResponse();
      const allowedKeys = new Set(["tags"]);
      if (bodyKeys.length === 0 || bodyKeys.some((key) => !allowedKeys.has(key))) {
        return forbiddenResponse();
      }
    } else {
      const fieldDenied = forbiddenForFieldRole(user.role);
      if (fieldDenied) return fieldDenied;
    }

    if (body.doNotService !== undefined && !canFlagDoNotService(user.role)) {
      return forbiddenResponse();
    }

    const customer = await prisma.customer.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: String(body.name) } : {}),
        ...(body.phone !== undefined
          ? { phone: body.phone ? normalizePhone(String(body.phone)) : null }
          : {}),
        ...(body.email !== undefined ? { email: body.email ?? null } : {}),
        ...(body.companyName !== undefined ? { companyName: body.companyName ?? null } : {}),
        ...(body.address !== undefined ? { address: body.address ?? null } : {}),
        ...(body.city !== undefined ? { city: body.city ?? null } : {}),
        ...(body.state !== undefined ? { state: body.state ?? null } : {}),
        ...(body.zip !== undefined ? { zip: body.zip ?? null } : {}),
        ...(body.leadSource !== undefined ? { leadSource: body.leadSource ?? null } : {}),
        ...(body.doNotService !== undefined ? { doNotService: Boolean(body.doNotService) } : {}),
        ...(body.tags !== undefined
          ? {
              tags: Array.isArray(body.tags)
                ? body.tags.map((t: unknown) => String(t).trim()).filter(Boolean)
                : [],
            }
          : {}),
        ...(body.status !== undefined && canManageCustomers(user.role)
          ? { status: body.status === "ARCHIVED" ? "ARCHIVED" : "ACTIVE" }
          : {}),
      },
      include: {
        _count: { select: { properties: true, visits: true, estimates: true, invoices: true } },
      },
    });

    return NextResponse.json(serializeCustomer(customer));
  } catch {
    return unauthorizedResponse();
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const fieldDenied = forbiddenForFieldRole(user.role); if (fieldDenied) return fieldDenied;

    const { id } = await params;
    const existing = await prisma.customer.findFirst({ where: { id, companyId: user.companyId } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.customer.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return unauthorizedResponse();
  }
}
