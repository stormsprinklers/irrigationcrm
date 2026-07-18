import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  assertFieldVisitAccess,
  type FieldAccessUser,
  type VisitAccessFields,
} from "@/lib/field/access";

export async function requireFieldVisitAccess(
  user: FieldAccessUser,
  visitId: string
): Promise<
  | { ok: true; visit: VisitAccessFields & { id: string } }
  | { ok: false; response: NextResponse }
> {
  const visit = await prisma.visit.findFirst({
    where: { id: visitId, companyId: user.companyId },
    select: {
      id: true,
      companyId: true,
      assignedUserId: true,
      crewId: true,
      createdByUserId: true,
    },
  });
  if (!visit) {
    return { ok: false, response: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  const access = await assertFieldVisitAccess(user, visit);
  if (!access.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: access.status === 404 ? "Not found" : "Forbidden" },
        { status: access.status }
      ),
    };
  }
  return { ok: true, visit };
}
