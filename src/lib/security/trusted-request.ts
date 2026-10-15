import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export function verifySharedSecret(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Fail-closed authentication for Vercel cron handlers. */
export function authorizeCronRequest(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    console.error("[security] CRON_SECRET is not configured; cron request denied");
    return NextResponse.json(
      { error: "Cron authentication is not configured" },
      { status: 503 }
    );
  }

  const supplied = request.headers.get("authorization") ?? "";
  if (!verifySharedSecret(supplied, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
