import { NextRequest, NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { uploadPrivateBlob } from "@/lib/blob/storage";
import { generateItemImage } from "@/lib/openai/client";
import { getItem } from "@/lib/price-book/queries";
import { canManagePriceBook } from "@/lib/price-book/permissions";
import { prisma } from "@/lib/prisma";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireSessionUser();
    if (!canManagePriceBook(user.role as UserRole)) return forbiddenResponse();

    const { id } = await params;
    const item = await prisma.priceBookItem.findFirst({
      where: { id, category: { companyId: user.companyId } },
    });
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const imageBuffer = await generateItemImage(item.name, item.description);
    const blob = await uploadPrivateBlob(
      `price-book/${user.companyId}/${id}-${Date.now()}.png`,
      new Blob([imageBuffer], { type: "image/png" }),
      { contentType: "image/png" }
    );

    await prisma.priceBookItem.update({
      where: { id },
      data: { imageUrl: blob.url },
    });

    const full = await getItem(user.companyId, id);
    return NextResponse.json(full);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Image generation failed";
    const status = message.includes("OPENAI") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
