import { NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const conversations = await prisma.stormAiConversation.findMany({
      where: { userId: user.id, companyId: user.companyId },
      orderBy: { updatedAt: "desc" },
      take: 40,
      select: { id: true, title: true, createdAt: true, updatedAt: true },
    });
    return NextResponse.json({ conversations });
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST() {
  try {
    const user = await requireSessionUser();
    const conversation = await prisma.stormAiConversation.create({
      data: {
        userId: user.id,
        companyId: user.companyId,
        title: null,
      },
      select: { id: true, title: true, createdAt: true, updatedAt: true },
    });
    return NextResponse.json({ conversation });
  } catch {
    return unauthorizedResponse();
  }
}
