import Link from "next/link";
import type { PriceBookCategoryDTO } from "@/lib/price-book/types";
import { getCategoryIcon } from "@/lib/price-book/icons";
import { Card, CardContent } from "@/components/ui/card";

export function CategoryCard({ category, href }: { category: PriceBookCategoryDTO; href: string }) {
  const Icon = getCategoryIcon(category.slug);
  const itemCount = category._count?.items ?? 0;
  const childCount = category._count?.children ?? 0;

  return (
    <Link href={href}>
      <Card className="group overflow-hidden transition-shadow hover:shadow-md">
        <CardContent className="relative p-0">
          <div className="flex h-36 items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100">
            <Icon className="h-16 w-16 text-primary/70" strokeWidth={1.5} />
          </div>
          <div className="flex items-center justify-between p-3">
            <div>
              <span className="text-sm font-medium">{category.name}</span>
              <p className="text-xs text-muted-foreground">
                {itemCount} item(s)
                {childCount > 0 ? ` · ${childCount} subcategories` : ""}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
