import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import {
  isRolePreviewOption,
  rolePreviewLabel,
  type RolePreviewOption,
} from "@/lib/role-preview";

/**
 * Start or stop admin role preview.
 * Body: `{ role: "MANAGER" | "CSR" | "TECH" | null }` — null exits preview.
 * Client applies the returned session via next-auth `update()`.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { role: true, status: true },
    });
    if (!dbUser || dbUser.status !== "ACTIVE") return unauthorizedResponse();
    if (dbUser.role !== "ADMIN") {
      return forbiddenResponse("Only admins can use role preview");
    }

    const body = await request.json().catch(() => ({}));
    const raw = body.role;

    if (raw === null || raw === "" || raw === "ADMIN") {
      return NextResponse.json({
        ok: true,
        preview: false,
        session: {
          role: "ADMIN" as const,
          trueRole: null,
        },
        message: "Exited role preview",
      });
    }

    if (typeof raw !== "string" || !isRolePreviewOption(raw)) {
      return badRequestResponse("role must be MANAGER, CSR, TECH, or null");
    }

    const previewRole = raw as RolePreviewOption;
    return NextResponse.json({
      ok: true,
      preview: true,
      session: {
        role: previewRole,
        trueRole: "ADMIN" as const,
      },
      message: `Viewing as ${rolePreviewLabel(previewRole)}`,
    });
  } catch {
    return unauthorizedResponse();
  }
}

export async function GET() {
  try {
    const user = await requireSessionUser();
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { role: true },
    });
    if (!dbUser || dbUser.role !== "ADMIN") {
      return forbiddenResponse("Only admins can use role preview");
    }

    const previewing = Boolean(user.trueRole && user.trueRole !== user.role);
    return NextResponse.json({
      ok: true,
      canPreview: true,
      previewing,
      effectiveRole: user.role,
      trueRole: user.trueRole ?? dbUser.role,
      options: ["MANAGER", "CSR", "TECH"],
    });
  } catch {
    return unauthorizedResponse();
  }
}
