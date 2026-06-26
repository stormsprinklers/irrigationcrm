import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse } from "@/lib/api-auth";
import { authenticateMobileUser, issueMobileSession } from "@/lib/mobile-auth/session";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = String(body.email ?? "").trim();
    const password = String(body.password ?? "");
    const deviceName = body.deviceName ? String(body.deviceName).slice(0, 120) : undefined;

    if (!email || !password) {
      return badRequestResponse("email and password are required");
    }

    const result = await authenticateMobileUser(email, password);
    if ("error" in result) {
      const message = result.error ?? "Invalid email or password";
      const status = message.includes("technicians and admins") ? 403 : 401;
      return NextResponse.json({ error: message }, { status });
    }

    const tokens = await issueMobileSession({
      userId: result.user.id,
      companyId: result.user.companyId,
      role: result.user.role,
      deviceName,
    });

    return NextResponse.json({
      ...tokens,
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        companyId: result.user.companyId,
        role: result.user.role,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Login failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
