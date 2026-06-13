import { CategoryCard } from "@/components/price-book/CategoryCard";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import {
  priceBookBreadcrumb,
  priceBookCategories,
} from "@/lib/mock/price-book-categories";
import { Pencil, Plus, Search, Settings } from "lucide-react";

export default function PriceBookPage() {
  return (
    <ContentArea>
      <PageHeader
        breadcrumb={priceBookBreadcrumb}
        title={
          <span className="flex items-center gap-2">
            Repair
            <Pencil className="h-4 w-4 text-muted-foreground" />
          </span>
        }
        actions={
          <>
            <Button variant="ghost" size="sm">
              <Settings className="h-4 w-4" />
              Price book settings
            </Button>
            <Button variant="outline" size="sm">
              <Search className="h-4 w-4" />
              Search
            </Button>
            <Button variant="outline" size="sm">
              <Plus className="h-4 w-4" />
              Subcategory
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {priceBookCategories.map((category) => (
          <CategoryCard key={category.id} category={category} />
        ))}
      </div>
    </ContentArea>
  );
}
