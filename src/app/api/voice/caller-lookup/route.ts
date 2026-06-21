import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { normalizePhone } from "@/lib/inbox/contacts";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const phone = request.nextUrl.searchParams.get("phone");
    if (!phone) {
      return NextResponse.json({ error: "phone required" }, { status: 400 });
    }

    const normalized = normalizePhone(phone);
    let customer = await prisma.customer.findFirst({
      where: { companyId: user.companyId, phone: normalized },
      select: { id: true, name: true, phone: true, doNotService: true },
    });

    if (!customer) {
      const alt = await prisma.customerPhone.findFirst({
        where: { companyId: user.companyId, phone: normalized },
        include: {
          customer: { select: { id: true, name: true, phone: true, doNotService: true } },
        },
      });
      customer = alt?.customer ?? null;
    }

    return NextResponse.json({
      customerId: customer?.id ?? null,
      name: customer?.name ?? null,
      phone: normalized,
      doNotService: customer?.doNotService ?? false,
    });
  } catch {
    return unauthorizedResponse();
  }
}
