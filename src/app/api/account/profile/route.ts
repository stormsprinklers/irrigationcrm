import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { pushEmployeeToLms } from "@/lib/integrations/lms-sync";
import { normalizeStaffPhone } from "@/lib/staff-auth";

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function GET() {
  try {
    const user = await requireSessionUser();
    const profile = await prisma.user.findFirst({
      where: { id: user.id, companyId: user.companyId, status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        photoUrl: true,
      },
    });
    if (!profile) return unauthorizedResponse();
    return NextResponse.json(profile);
  } catch {
    return unauthorizedResponse();
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const existing = await prisma.user.findFirst({
      where: { id: user.id, companyId: user.companyId, status: "ACTIVE" },
      select: { id: true, email: true, phone: true },
    });
    if (!existing) return unauthorizedResponse();

    const body = await request.json().catch(() => ({}));
    const data: { email?: string; phone?: string | null } = {};

    if (body.email !== undefined) {
      const email = String(body.email ?? "")
        .trim()
        .toLowerCase();
      if (!isValidEmail(email)) {
        return badRequestResponse("Enter a valid email address");
      }
      if (email !== existing.email) {
        const dup = await prisma.user.findFirst({
          where: {
            companyId: user.companyId,
            email,
            NOT: { id: user.id },
          },
          select: { id: true },
        });
        if (dup) return badRequestResponse("Email already in use at this company");
      }
      data.email = email;
    }

    if (body.phone !== undefined) {
      const raw = String(body.phone ?? "").trim();
      if (!raw) {
        data.phone = null;
      } else {
        const normalized = normalizeStaffPhone(raw);
        if (!normalized) {
          return badRequestResponse("Enter a valid 10-digit mobile number");
        }
        data.phone = normalized;
      }
    }

    if (Object.keys(data).length === 0) {
      return badRequestResponse("No account fields to update");
    }

    await prisma.user.update({
      where: { id: user.id },
      data,
    });

    const profile = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        photoUrl: true,
        role: true,
        status: true,
      },
    });

    if (profile) {
      await pushEmployeeToLms(profile).catch(() => null);
    }

    return NextResponse.json(
      profile
        ? {
            id: profile.id,
            name: profile.name,
            email: profile.email,
            phone: profile.phone,
            photoUrl: profile.photoUrl,
          }
        : profile
    );
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    return NextResponse.json({ error: "Failed to update account" }, { status: 500 });
  }
}
