"use client";

import { useCallback, useEffect, useState } from "react";
import { CategoryCard } from "@/components/price-book/CategoryCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PriceBookCategoryDTO, PriceBookItemDTO } from "@/lib/price-book/types";
import { Pencil, Plus, Search, Settings } from "lucide-react";
import { toast } from "sonner";

const priceBookBreadcrumb = ["Price book", "Services", "Landscaping & Lawn", "Repair"];

export function PriceBookContent() {
  const [categories, setCategories] = useState<PriceBookCategoryDTO[]>([]);
  const [items, setItems] = useState<PriceBookItemDTO[]>([]);
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [catRes, itemRes] = await Promise.all([
      fetch("/api/price-book/categories"),
      fetch(`/api/price-book/items${search ? `?q=${encodeURIComponent(search)}` : ""}`),
    ]);
    if (catRes.ok) setCategories(await catRes.json());
    if (itemRes.ok) setItems(await itemRes.json());
  }, [search]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function createCategory() {
    const name = prompt("Category name");
    if (!name?.trim()) return;
    const res = await fetch("/api/price-book/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    if (!res.ok) {
      toast.error("Failed to create category");
      return;
    }
    toast.success("Category created");
    await load();
  }

  return (
    <>
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
            <Button variant="outline" size="sm" onClick={() => setShowSearch((v) => !v)}>
              <Search className="h-4 w-4" />
              Search
            </Button>
            <Button variant="outline" size="sm" onClick={createCategory}>
              <Plus className="h-4 w-4" />
              Subcategory
            </Button>
          </>
        }
      />

      {showSearch ? (
        <div className="mb-4 max-w-md">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search price book items..."
          />
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading price book...</p>
      ) : search ? (
        <div className="space-y-2">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No items match your search.</p>
          ) : (
            items.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.category?.name}</p>
                </div>
                <p className="font-medium">
                  {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
                    Number(item.unitPrice)
                  )}
                </p>
              </div>
            ))
          )}
        </div>
      ) : categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">No categories yet. Add a subcategory to get started.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {categories.map((category) => (
            <CategoryCard key={category.id} category={category} />
          ))}
        </div>
      )}
    </>
  );
}
