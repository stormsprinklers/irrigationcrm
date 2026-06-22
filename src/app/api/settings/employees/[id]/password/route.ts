import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import {
  canSetEmployeePassword,
  validateEmployeePassword,
} from "@/lib/employees";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canSetEmployeePassword(user.role)) return forbiddenResponse();

    const { id } = await params;
    const existing = await prisma.user.findFirst({
      where: { id, companyId: user.companyId },
      select: { id: true, email: true },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();
    const password = typeof body.password === "string" ? body.password : "";
    const confirmPassword =
      typeof body.confirmPassword === "string" ? body.confirmPassword : password;

    const passwordError = validateEmployeePassword(password);
    if (passwordError) return badRequestResponse(passwordError);

    if (password !== confirmPassword) {
      return badRequestResponse("Passwords do not match");
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.update({
      where: { id },
      data: { passwordHash },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    return NextResponse.json({ error: "Failed to set password" }, { status: 500 });
  }
}
