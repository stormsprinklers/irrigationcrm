import { NextRequest, NextResponse } from "next/server";
import { IntegrationType } from "@prisma/client";
import { authenticateIntegration, isIntegrationContext } from "@/lib/integrations/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await authenticateIntegration(request, IntegrationType.DESIGN);
  if (!isIntegrationContext(auth)) return auth;

  const { id } = await context.params;
  const customer = await prisma.customer.findFirst({
    where: { id, companyId: auth.companyId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      properties: {
        select: {
          id: true,
          name: true,
          address: true,
          city: true,
          state: true,
          zip: true,
          isPrimary: true,
          designProjectId: true,
        },
        orderBy: { isPrimary: "desc" },
      },
    },
  });

  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  return NextResponse.json({ customer });
}
