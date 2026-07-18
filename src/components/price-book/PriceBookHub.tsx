"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Download, Plus, Search, Upload } from "lucide-react";
import { toast } from "sonner";
import { CategoryCard } from "@/components/price-book/CategoryCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { PriceBookImportDialog } from "@/components/price-book/PriceBookImportDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PriceBookCategoryDTO, PriceBookImportResult, PriceBookItemDTO } from "@/lib/price-book/types";

type Props = {
  type: "SERVICE" | "MATERIAL";
  title: string;
  breadcrumb: string[];
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export function PriceBookHub({ type, title, breadcrumb }: Props) {
  const [categories, setCategories] = useState<PriceBookCategoryDTO[]>([]);
  const [items, setItems] = useState<PriceBookItemDTO[]>([]);
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [catRes, itemRes] = await Promise.all([
      fetch(`/api/price-book/categories?type=${type}`),
      fetch(`/api/price-book/items?type=${type}${search ? `&q=${encodeURIComponent(search)}` : ""}`),
    ]);
    if (catRes.ok) setCategories(await catRes.json());
    if (itemRes.ok) setItems(await itemRes.json());
  }, [type, search]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function createCategory() {
    const name = prompt(type === "SERVICE" ? "Industry or category name" : "Category name");
    if (!name?.trim()) return;
    const res = await fetch("/api/price-book/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), type }),
    });
    if (!res.ok) {
      toast.error("Failed to create category");
      return;
    }
    toast.success("Category created");
    await load();
  }

  async function renameCategory(category: PriceBookCategoryDTO) {
    const name = prompt("Rename category", category.name);
    if (!name?.trim() || name.trim() === category.name) return;
    const res = await fetch(`/api/price-book/categories/${category.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    if (!res.ok) {
      toast.error("Failed to rename category");
      return;
    }
    toast.success("Category renamed");
    await load();
  }

  async function deleteCategory(category: PriceBookCategoryDTO) {
    const itemCount = category._count?.items ?? 0;
    const childCount = category._count?.children ?? 0;
    const warning =
      itemCount || childCount
        ? `Delete “${category.name}”? This permanently removes ${itemCount} item(s) and ${childCount} subcategory(ies).`
        : `Delete “${category.name}”?`;
    if (!confirm(warning)) return;
    const res = await fetch(`/api/price-book/categories/${category.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to delete category");
      return;
    }
    toast.success("Category deleted");
    await load();
  }

  function handleImported(result: PriceBookImportResult) {
    load();
    if (result.errors.length > 0) {
      console.warn("Import errors", result.errors);
    }
  }

  return (
    <>
      <PageHeader
        breadcrumb={breadcrumb}
        title={title}
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <a href={`/api/price-book/import?type=${type}`} download>
                <Download className="h-4 w-4" />
                Export CSV
              </a>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4" />
              Import CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowSearch((v) => !v)}>
              <Search className="h-4 w-4" />
              Search
            </Button>
            <Button variant="outline" size="sm" onClick={createCategory}>
              <Plus className="h-4 w-4" />
              {type === "SERVICE" ? "Add industry/category" : "Add category"}
            </Button>
          </>
        }
      />

      <p className="mb-4 text-sm text-muted-foreground">
        Organize {type === "SERVICE" ? "flat-rate services with optional labor rates and bundled materials" : "parts and materials with cost, price, and optional markup"}.
        Import Housecall Pro CSV exports directly.
      </p>

      {showSearch ? (
        <div className="mb-4 max-w-md">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${type === "SERVICE" ? "services" : "materials"}...`}
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
              <Link
                key={item.id}
                href={`/price-book/categories/${item.categoryId}`}
                className="flex items-center justify-between rounded-md border p-3 hover:bg-muted/40"
              >
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.category?.name}
                    {item.sku ? ` · SKU ${item.sku}` : ""}
                  </p>
                </div>
                <p className="font-medium">{formatCurrency(item.unitPrice)}</p>
              </Link>
            ))
          )}
        </div>
      ) : categories.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No categories yet. Create one or import a Housecall Pro CSV export.
          </p>
          <Button className="mt-4" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4" />
            Import CSV
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {categories.map((category) => (
            <CategoryCard
              key={category.id}
              category={category}
              href={`/price-book/categories/${category.id}`}
              onRename={() => void renameCategory(category)}
              onDelete={() => void deleteCategory(category)}
            />
          ))}
        </div>
      )}

      <PriceBookImportDialog
        open={importOpen}
        type={type}
        onClose={() => setImportOpen(false)}
        onImported={handleImported}
      />
    </>
  );
}
