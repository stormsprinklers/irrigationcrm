import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { serializeSeoTask } from "@/lib/marketing/seo-ai";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.seoTask.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (body.completed === undefined) {
      return badRequestResponse("completed is required");
    }

    const completed = Boolean(body.completed);
    const updated = await prisma.seoTask.update({
      where: { id },
      data: {
        completed,
        completedAt: completed ? new Date() : null,
      },
    });

    return NextResponse.json(serializeSeoTask(updated));
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message = error instanceof Error ? error.message : "Failed to update SEO task";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;

    const result = await prisma.seoTask.deleteMany({
      where: { id, companyId: user.companyId },
    });
    if (result.count === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message = error instanceof Error ? error.message : "Failed to delete SEO task";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
