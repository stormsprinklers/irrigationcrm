import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { serializePolicy } from "@/lib/storm-ai/policies";

function forbid(role: string) {
  return role !== "ADMIN" && role !== "MANAGER";
}

export async function GET() {
  try {
    const user = await requireSessionUser();
    if (forbid(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const policies = await prisma.stormAiCompanyPolicy.findMany({
      where: { companyId: user.companyId },
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    });
    return NextResponse.json({ policies: policies.map(serializePolicy) });
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (forbid(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = (await request.json()) as {
      title?: string;
      category?: string | null;
      description?: string;
    };
    const title = body.title?.trim();
    if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
    const count = await prisma.stormAiCompanyPolicy.count({ where: { companyId: user.companyId } });
    const policy = await prisma.stormAiCompanyPolicy.create({
      data: {
        companyId: user.companyId,
        title,
        category: body.category?.trim() || null,
        description: body.description?.trim() || "",
        sortOrder: count,
      },
    });
    return NextResponse.json(serializePolicy(policy), { status: 201 });
  } catch {
    return unauthorizedResponse();
  }
}
