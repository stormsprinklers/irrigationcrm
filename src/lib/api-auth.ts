import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyMobileAccessToken } from "@/lib/mobile-auth/tokens";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  companyId: string;
  role: string;
};

function bearerFromAuthHeader(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token || null;
}

async function getBearerFromHeaders(): Promise<string | null> {
  try {
    const headerList = await headers();
    return bearerFromAuthHeader(headerList.get("authorization"));
  } catch {
    return null;
  }
}

async function userFromBearerToken(token: string): Promise<SessionUser | null> {
  const claims = await verifyMobileAccessToken(token);
  if (!claims) return null;

  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    select: {
      id: true,
      email: true,
      name: true,
      companyId: true,
      role: true,
      status: true,
    },
  });

  if (!user || user.status !== "ACTIVE") return null;
  if (user.companyId !== claims.companyId || user.role !== claims.role) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    companyId: user.companyId,
    role: user.role,
  };
}

export async function getSessionUser(request?: Request): Promise<SessionUser | null> {
  const session = await auth();
  if (session?.user?.id && session.user.companyId) {
    return {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      companyId: session.user.companyId,
      role: session.user.role,
    };
  }

  let bearer = request ? bearerFromAuthHeader(request.headers.get("authorization")) : null;
  if (!bearer) {
    bearer = await getBearerFromHeaders();
  }

  if (bearer) {
    return userFromBearerToken(bearer);
  }

  return null;
}

export async function requireSessionUser(request?: Request) {
  const user = await getSessionUser(request);
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user;
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function badRequestResponse(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function forbiddenResponse(message = "Forbidden") {
  return NextResponse.json({ error: message }, { status: 403 });
}

/** Block service technicians and installers from office-only API actions. */
export function forbiddenForFieldRole(role: string) {
  if (role === "TECH" || role === "INSTALLER") {
    return forbiddenResponse();
  }
}

export function notFoundResponse(message = "Not found") {
  return NextResponse.json({ error: message }, { status: 404 });
}
