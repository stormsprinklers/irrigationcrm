import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import type { PriceBookCategoryDTO } from "@/lib/price-book/types";
import { getCategoryIcon } from "@/lib/price-book/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Props = {
  category: PriceBookCategoryDTO;
  href: string;
  onRename?: () => void;
  onDelete?: () => void;
};

export function CategoryCard({ category, href, onRename, onDelete }: Props) {
  const Icon = getCategoryIcon(category.slug);
  const itemCount = category._count?.items ?? 0;
  const childCount = category._count?.children ?? 0;

  return (
    <Card className="group relative overflow-hidden transition-shadow hover:shadow-md">
      {(onRename || onDelete) && (
        <div className="absolute right-2 top-2 z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          {onRename ? (
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="h-8 w-8 shadow-sm"
              aria-label={`Rename ${category.name}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRename();
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          ) : null}
          {onDelete ? (
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="h-8 w-8 shadow-sm"
              aria-label={`Delete ${category.name}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete();
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      )}
      <Link href={href} className="block">
        <CardContent className="p-0">
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
      </Link>
    </Card>
  );
}
