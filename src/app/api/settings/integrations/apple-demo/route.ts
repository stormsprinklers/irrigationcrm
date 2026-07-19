import { NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import {
  createAppleDemoAccount,
  getAppleDemoAccount,
  resetAppleDemoPassword,
  setAppleDemoAccountEnabled,
} from "@/lib/apple-demo/account";

function requireAdmin(role: string) {
  return role === "ADMIN" || role === "MANAGER";
}

export async function GET() {
  try {
    const user = await requireSessionUser();
    if (!requireAdmin(user.role)) return forbiddenResponse();

    const account = await getAppleDemoAccount(user.companyId);
    return NextResponse.json({
      account: account
        ? {
            id: account.id,
            email: account.email,
            name: account.name,
            role: account.role,
            status: account.status,
            enabled: account.status === "ACTIVE",
            createdAt: account.createdAt.toISOString(),
            updatedAt: account.updatedAt.toISOString(),
          }
        : null,
    });
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!requireAdmin(user.role)) return forbiddenResponse();

    const body = (await request.json().catch(() => ({}))) as { action?: string };
    const action = String(body.action ?? "create").toLowerCase();

    if (action === "create") {
      const result = await createAppleDemoAccount(user.companyId);
      if ("error" in result) {
        return NextResponse.json(
          { error: result.error, account: "existing" in result ? result.existing : null },
          { status: 409 }
        );
      }
      return NextResponse.json(
        {
          account: {
            id: result.user.id,
            email: result.user.email,
            name: result.user.name,
            role: result.user.role,
            status: result.user.status,
            enabled: true,
            createdAt: result.user.createdAt.toISOString(),
            updatedAt: result.user.updatedAt.toISOString(),
          },
          plainPassword: result.plainPassword,
        },
        { status: 201 }
      );
    }

    if (action === "enable" || action === "disable") {
      const result = await setAppleDemoAccountEnabled(user.companyId, action === "enable");
      if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: 404 });
      }
      return NextResponse.json({
        account: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          role: result.user.role,
          status: result.user.status,
          enabled: result.user.status === "ACTIVE",
          createdAt: result.user.createdAt.toISOString(),
          updatedAt: result.user.updatedAt.toISOString(),
        },
      });
    }

    if (action === "reset_password") {
      const result = await resetAppleDemoPassword(user.companyId);
      if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: 404 });
      }
      return NextResponse.json({
        account: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          role: result.user.role,
          status: result.user.status,
          enabled: result.user.status === "ACTIVE",
          createdAt: result.user.createdAt.toISOString(),
          updatedAt: result.user.updatedAt.toISOString(),
        },
        plainPassword: result.plainPassword,
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch {
    return unauthorizedResponse();
  }
}
