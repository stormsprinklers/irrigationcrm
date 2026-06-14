import { NextRequest, NextResponse } from "next/server";
import type { PriceBookItemType, UserRole } from "@prisma/client";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { generateItemDescription } from "@/lib/openai/client";
import { canManagePriceBook } from "@/lib/price-book/permissions";

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canManagePriceBook(user.role as UserRole)) return forbiddenResponse();

    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const type = (body.type ?? "SERVICE") as PriceBookItemType;
    if (!name) {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }

    const description = await generateItemDescription(name, type);
    return NextResponse.json({ description });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation failed";
    const status = message.includes("OPENAI") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
