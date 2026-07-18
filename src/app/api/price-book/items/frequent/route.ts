import { NextRequest, NextResponse } from "next/server";
import type { PriceBookItemType } from "@prisma/client";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { listItems } from "@/lib/price-book/queries";
import { prisma } from "@/lib/prisma";

/**
 * Company-wide frequently used price book items (top N by line-item usage).
 * Counts visit + estimate line items that reference a price book item.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const type = request.nextUrl.searchParams.get("type") as PriceBookItemType | null;
    const limit = Math.min(
      50,
      Math.max(1, Number(request.nextUrl.searchParams.get("limit") ?? 20) || 20)
    );

    const visitCounts = await prisma.visitLineItem.groupBy({
      by: ["priceBookItemId"],
      where: {
        priceBookItemId: { not: null },
        visit: { companyId: user.companyId },
        ...(type
          ? { priceBookItem: { type, active: true, category: { companyId: user.companyId } } }
          : { priceBookItem: { active: true, category: { companyId: user.companyId } } }),
      },
      _count: { _all: true },
    });

    const estimateCounts = await prisma.estimateLineItem.groupBy({
      by: ["priceBookItemId"],
      where: {
        priceBookItemId: { not: null },
        estimate: { companyId: user.companyId },
        ...(type
          ? { priceBookItem: { type, active: true, category: { companyId: user.companyId } } }
          : { priceBookItem: { active: true, category: { companyId: user.companyId } } }),
      },
      _count: { _all: true },
    });

    const totals = new Map<string, number>();
    for (const row of visitCounts) {
      if (!row.priceBookItemId) continue;
      totals.set(row.priceBookItemId, (totals.get(row.priceBookItemId) ?? 0) + row._count._all);
    }
    for (const row of estimateCounts) {
      if (!row.priceBookItemId) continue;
      totals.set(row.priceBookItemId, (totals.get(row.priceBookItemId) ?? 0) + row._count._all);
    }

    const ranked = [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id]) => id);

    if (!ranked.length) {
      return NextResponse.json({ items: [] });
    }

    const all = await listItems({
      companyId: user.companyId,
      type: type ?? undefined,
      activeOnly: true,
    });
    const byId = new Map(all.map((item) => [item.id, item]));
    const items = ranked.map((id) => byId.get(id)).filter(Boolean);

    return NextResponse.json({ items });
  } catch {
    return unauthorizedResponse();
  }
}
